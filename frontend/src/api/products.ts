export type ProductCategory = "PART" | "RESALE_GOOD";
export type ProductStatus = "active" | "inactive" | "all";
export interface CatalogProduct {
  publicId: string;
  internalCode: string | null;
  description: string;
  category: ProductCategory;
  salePrice: string | null;
  acquisitionCost?: string | null;
  grossProfitEstimate?: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProductPage {
  data: CatalogProduct[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export class ProductApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "ProductApiError";
  }
}

async function request<T>(path: string, method = "GET", csrfToken?: string, payload?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = isRecord(body) ? body : undefined;
    const error = root && isRecord(root.error) ? root.error : root;
    throw new ProductApiError(response.status, typeof error?.code === "string" ? error.code : undefined,
      typeof error?.message === "string" ? error.message : "Não foi possível concluir a operação.");
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function listProducts(page: number, status: ProductStatus, search: string, category: ProductCategory | "all", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: "20", status });
  if (search.trim()) query.set("search", search.trim());
  if (category !== "all") query.set("category", category);
  return request<ProductPage>(`/api/v1/products?${query}`, "GET", undefined, undefined, signal);
}

export function createProduct(input: { internalCode: string; description: string; category: ProductCategory; salePrice: string; acquisitionCost?: string }, csrfToken: string) {
  return request<{ data: CatalogProduct }>("/api/v1/products", "POST", csrfToken, {
    internalCode: input.internalCode.trim() || null,
    description: input.description,
    category: input.category,
    salePrice: input.salePrice.trim() ? input.salePrice.trim().replace(",", ".") : null,
    ...(input.acquisitionCost !== undefined ? { acquisitionCost: input.acquisitionCost.trim() ? input.acquisitionCost.trim().replace(",", ".") : null } : {}),
  });
}

export function updateProduct(product: CatalogProduct, input: { internalCode: string; description: string; category: ProductCategory; salePrice: string; acquisitionCost?: string }, csrfToken: string) {
  return request<{ data: CatalogProduct }>(`/api/v1/products/${encodeURIComponent(product.publicId)}`, "PATCH", csrfToken, {
    internalCode: input.internalCode.trim() || null,
    description: input.description,
    category: input.category,
    salePrice: input.salePrice.trim() ? input.salePrice.trim().replace(",", ".") : null,
    ...(input.acquisitionCost !== undefined ? { acquisitionCost: input.acquisitionCost.trim() ? input.acquisitionCost.trim().replace(",", ".") : null } : {}),
    expectedVersion: product.version,
  });
}

export function changeProductActivity(product: CatalogProduct, isActive: boolean, csrfToken: string) {
  return request<{ data: CatalogProduct }>(`/api/v1/products/${encodeURIComponent(product.publicId)}`, "PATCH", csrfToken, {
    isActive,
    expectedVersion: product.version,
  });
}
