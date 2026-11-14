import type { Database } from "@grabmarket/db";
import { won } from "@grabmarket/shared";
import { selectAll } from "../../shared/infra/rows.ts";
import type {
  CatalogRepository,
  Category,
  CategoryCount,
  CategorySlug,
  Product,
  ProductVariant,
  SearchCriteria,
  SuggestMatches,
  VariantRef,
} from "../domain/product.ts";

interface ProductRow {
  id: number;
  base_key: string;
  name: string;
  option_label: string | null;
  description: string;
  price: number;
  image_path: string;
  slug: CategorySlug;
  category_name: string;
  quantity: number;
}

const PRODUCT_SELECT = `
  SELECT p.id, p.base_key, p.name, p.option_label, p.description, p.price, p.image_path,
         c.slug, c.name AS category_name, i.quantity
    FROM products p
    JOIN categories c ON c.id = p.category_id
    JOIN inventory i ON i.product_id = p.id`;

const ORDER_BY = {
  default: "c.sort_order, p.id",
  price_asc: "p.price, p.id",
  price_desc: "p.price DESC, p.id",
} as const;

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    baseKey: row.base_key,
    name: row.name,
    optionLabel: row.option_label,
    description: row.description,
    category: { slug: row.slug, name: row.category_name },
    price: won(row.price),
    imagePath: row.image_path,
    stockQuantity: row.quantity,
  };
}

function likePattern(q: string): string {
  return `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

/** 검색 조건을 WHERE 조각과 값으로 바꾼다. 카테고리 개수 계산은 category 조건을 뺀다. */
function whereClause(criteria: SearchCriteria, withCategory: boolean): { sql: string; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (criteria.q !== "") {
    conditions.push("p.name LIKE ? ESCAPE '\\'");
    params.push(likePattern(criteria.q));
  }
  if (withCategory && criteria.category !== undefined) {
    conditions.push("c.slug = ?");
    params.push(criteria.category);
  }
  if (criteria.minPrice !== undefined) {
    conditions.push("p.price >= ?");
    params.push(criteria.minPrice);
  }
  if (criteria.maxPrice !== undefined) {
    conditions.push("p.price <= ?");
    params.push(criteria.maxPrice);
  }
  if (criteria.excludeSoldOut) conditions.push("i.quantity > 0");
  return { sql: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`, params };
}

export class SqliteCatalogRepository implements CatalogRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  listCategories(): Category[] {
    return selectAll<{ id: number; slug: CategorySlug; name: string; product_count: number }>(
      this.#db,
      `SELECT c.id, c.slug, c.name, COUNT(p.id) AS product_count
         FROM categories c LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id ORDER BY c.sort_order`,
    ).map((row) => ({ id: row.id, slug: row.slug, name: row.name, productCount: row.product_count }));
  }

  search(criteria: SearchCriteria): Product[] {
    const where = whereClause(criteria, true);
    return selectAll<ProductRow>(this.#db, `${PRODUCT_SELECT} ${where.sql} ORDER BY ${ORDER_BY[criteria.sort]}`, ...where.params).map(toProduct);
  }

  countByCategory(criteria: SearchCriteria): CategoryCount[] {
    const where = whereClause(criteria, false);
    const filter = where.sql === "" ? "" : `AND ${where.sql.slice("WHERE ".length)}`;
    // 카테고리마다 같은 조건을 적용한 개수를 센다. 값은 하위 질의에 한 번 묶인다.
    return selectAll<{ slug: CategorySlug; name: string; count: number }>(
      this.#db,
      `SELECT c.slug, c.name,
              (SELECT COUNT(*) FROM products p JOIN inventory i ON i.product_id = p.id
                WHERE p.category_id = c.id ${filter}) AS count
         FROM categories c ORDER BY c.sort_order`,
      ...where.params,
    );
  }

  suggest(q: string, limit: number): SuggestMatches {
    const pattern = likePattern(q);
    const products = selectAll<{ id: number; name: string }>(
      this.#db,
      "SELECT id, name FROM products WHERE name LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?",
      pattern,
      limit,
    );
    const categorySlugs = selectAll<{ slug: CategorySlug }>(
      this.#db,
      `SELECT DISTINCT c.slug FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.name LIKE ? ESCAPE '\\' ORDER BY c.sort_order`,
      pattern,
    ).map((row) => row.slug);
    return { products, categorySlugs };
  }

  findById(id: number): Product | undefined {
    const [row] = selectAll<ProductRow>(this.#db, `${PRODUCT_SELECT} WHERE p.id = ?`, id);
    return row === undefined ? undefined : toProduct(row);
  }

  findByIds(ids: number[]): Product[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    return selectAll<ProductRow>(this.#db, `${PRODUCT_SELECT} WHERE p.id IN (${placeholders})`, ...ids).map(toProduct);
  }

  findByVariants(refs: readonly VariantRef[]): Product[] {
    if (refs.length === 0) return [];
    const conditions = refs.map(() => "(p.base_key = ? AND p.option_label = ?)").join(" OR ");
    return selectAll<ProductRow>(
      this.#db,
      `${PRODUCT_SELECT} WHERE ${conditions}`,
      ...refs.flatMap((ref) => [ref.baseKey, ref.optionLabel]),
    ).map(toProduct);
  }

  findVariants(baseKey: string): ProductVariant[] {
    return selectAll<{ id: number; option_label: string | null; price: number; quantity: number }>(
      this.#db,
      `SELECT p.id, p.option_label, p.price, i.quantity
         FROM products p JOIN inventory i ON i.product_id = p.id
        WHERE p.base_key = ? ORDER BY p.price, p.id`,
      baseKey,
    ).map((row) => ({ id: row.id, optionLabel: row.option_label, price: won(row.price), stockQuantity: row.quantity }));
  }
}
