import { describe, it, expectTypeOf } from "vitest";
import type {
  PaginatedResult,
  ListRepositoriesInput,
  ListRepositoriesResult,
} from "./types.js";
import type { Repository } from "../bitbucket-api.js";

describe("core/types", () => {
  it("PaginatedResult exposes Bitbucket pagination metadata", () => {
    expectTypeOf<PaginatedResult<Repository>>().toEqualTypeOf<{
      items: Repository[];
      page?: number;
      pagelen?: number;
      next?: string;
      hasMore: boolean;
    }>();
  });

  it("ListRepositoriesInput requires workspace and allows the documented filters", () => {
    expectTypeOf<ListRepositoriesInput>().toEqualTypeOf<{
      workspace: string;
      role?: "owner" | "admin" | "contributor" | "member";
      sort?: "created_on" | "updated_on" | "name" | "size";
      page?: string;
      pagelen?: number;
    }>();
  });

  it("ListRepositoriesResult uses the shared paginated shape", () => {
    expectTypeOf<ListRepositoriesResult>().toEqualTypeOf<
      PaginatedResult<Repository>
    >();
  });
});
