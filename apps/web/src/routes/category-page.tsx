import { CategorySlugSchema } from "@grabmarket/contracts";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { streamed } from "../lib/streamed.ts";
import { callApi } from "../api/client.ts";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { EmptyState } from "../components/states.tsx";
import { NotFoundError } from "../lib/not-found.ts";
import { parseSearchParams } from "../lib/search-params.ts";
import { useRootData } from "../state/root-data.ts";
import { ProductListHeading } from "./product-list.tsx";

export function categoryLoader({ params, request }: LoaderFunctionArgs) {
  const slug = CategorySlugSchema.safeParse(params.slug);
  const parsed = parseSearchParams(new URL(request.url).searchParams);
  if (!slug.success || parsed === null) throw new NotFoundError("찾을 수 없는 카테고리입니다");
  return { slug: slug.data, result: streamed(callApi("searchProducts", { query: { category: slug.data, sort: parsed.query.sort } })) };
}

export function CategoryPage() {
  const { slug, result } = useLoaderData<typeof categoryLoader>();
  const { categories } = useRootData();
  const name = categories.find((category) => category.slug === slug)?.name ?? slug;
  return (
    <Page>
      <Loaded
        resolve={result}
        failure="상품을 불러오지 못했어요"
        skeleton={
          <>
            <ProductListHeading title={name} sortable />
            <ProductGridSkeleton />
          </>
        }
      >
        {(data) => (
          <>
            <ProductListHeading title={name} count={data.total} sortable />
            {data.products.length === 0 ? (
              <EmptyState title="이 카테고리에는 아직 상품이 없어요" hint="상품이 올라오면 여기에 보여요" />
            ) : (
              <ProductGrid products={data.products} />
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
