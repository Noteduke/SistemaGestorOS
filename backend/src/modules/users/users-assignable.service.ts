import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { ListAssignableUsersQuery } from "./dto/list-assignable-users-query.dto.js";

@Injectable()
export class UsersAssignableService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssignable(query: ListAssignableUsersQuery) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      ...(query.search ? { username: { contains: query.search } } : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { publicId: true, username: true },
        orderBy: [{ username: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
