import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseListAssignableUsersQuery } from "./dto/list-assignable-users-query.dto.js";
import { UsersAssignableService } from "./users-assignable.service.js";

@Controller("users")
export class UsersAssignableController {
  constructor(private readonly users: UsersAssignableService) {}

  @Get("assignable")
  @RequirePermissions("service_orders.assignment.manage")
  listAssignable(@Query() query: Record<string, unknown>) {
    return this.users.listAssignable(parseListAssignableUsersQuery(query));
  }
}
