import type { ProductSearchResponse } from "@grabmarket/contracts";
import { useLoaderData } from "react-router";
import { callApi } from "../api/client.ts";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { EmptyState } from "../components/states.tsx";
import { ProductListHeading } from "./product-list.tsx";

export function homeLoader() {
  return { result: callApi("searchProducts", { query: {} }) };
}

export function HomePage() {
  const { result } = useLoaderData<typeof homeLoader>();
  return (
    <Page>
      <Loaded
        resolve={result}
        failure="상품을 불러오지 못했어요"
        skeleton={
          <>
            <ProductListHeading title="전체 상품" />
            <ProductGridSkeleton />
          </>
        }
      >
        {(data: ProductSearchResponse) => (
          <>
            <ProductListHeading title="전체 상품" count={data.total} />
            {data.products.length === 0 ? (
              <EmptyState title="아직 등록된 상품이 없어요" hint="상품이 올라오면 여기에 보여요" />
            ) : (
              <ProductGrid products={data.products} />
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
