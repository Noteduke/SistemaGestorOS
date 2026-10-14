import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { RequireAuthenticated, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { parseListServiceOrdersQuery } from "./dto/list-service-orders-query.dto.js";
import { parseOperationalSituationPatch } from "./dto/operational-situation-patch.dto.js";
import { ServiceOrderOperationalSituationService } from "./service-order-operational-situation.service.js";
import { parseAssignmentsPut } from "./dto/assignments-put.dto.js";
import { parseListServiceOrderEventsQuery } from "./dto/list-service-order-events-query.dto.js";
import { ServiceOrderAssignmentsService } from "./service-order-assignments.service.js";
import { ServiceOrderEventsReadService } from "./service-order-events-read.service.js";
import { ServiceOrdersReadService } from "./service-orders-read.service.js";
import { parseCreateServiceOrderNote } from "./dto/service-order-note.dto.js";
import { parseListServiceOrderHistoryQuery } from "./dto/list-service-order-history-query.dto.js";
import { ServiceOrderNotesService } from "./service-order-notes.service.js";
import { ServiceOrderHistoryService } from "./service-order-history.service.js";
import { ServiceOrderBudgetItemsService } from "./service-order-budget-items.service.js";
import { parseCreateManualLabor, parseCreateManualPart, parseCreateRegisteredLabor, parseUpdateBudgetItem } from "./dto/budget-item.dto.js";

@Controller("service-orders")
export class ServiceOrdersController {
  constructor(
    private readonly orders: ServiceOrdersReadService,
    private readonly events: ServiceOrderEventsReadService,
    private readonly situations: ServiceOrderOperationalSituationService,
    private readonly assignments: ServiceOrderAssignmentsService,
    private readonly notes: ServiceOrderNotesService,
    private readonly history: ServiceOrderHistoryService,
    private readonly budgetItems: ServiceOrderBudgetItemsService,
  ) {}

  @Get()
  @RequirePermissions("service_orders.read")
  list(@Query() query: Record<string, unknown>) {
    return this.orders.list(parseListServiceOrdersQuery(query));
  }

  @Get(":publicId")
  @RequirePermissions("service_orders.read")
  getByPublicId(@Param("publicId") publicId: string) {
    return this.orders.getByPublicId(publicId);
  }

  @Get(":publicId/events")
  @RequirePermissions("service_orders.events.read")
  listEvents(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.events.list(publicId, parseListServiceOrderEventsQuery(query), request.auth!);
  }

  @Get(":publicId/history")
  @RequirePermissions("service_orders.events.read")
  listHistory(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.history.list(publicId, parseListServiceOrderHistoryQuery(query), request.auth!);
  }

  @Get(":publicId/budget-items")
  @RequirePermissions("service_orders.read")
  listBudgetItems(@Param("publicId") publicId: string, @Req() request: AuthRequest) {
    return this.budgetItems.list(publicId, request.auth!);
  }

  @Post(":publicId/budget-items/service")
  @RequirePermissions("service_orders.budget.update")
  addRegisteredService(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.budgetItems.createRegistered(publicId, parseCreateRegisteredLabor(body), request.auth!);
  }

  @Post(":publicId/budget-items/manual-labor")
  @RequirePermissions("service_orders.budget.update")
  addManualLabor(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.budgetItems.createManualLabor(publicId, parseCreateManualLabor(body), request.auth!);
  }

  @Post(":publicId/budget-items/manual-part")
  @RequirePermissions("service_orders.budget.update")
  addManualPart(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.budgetItems.createManualPart(publicId, parseCreateManualPart(body), request.auth!);
  }

  @Patch(":publicId/budget-items/:itemPublicId")
  @RequirePermissions("service_orders.budget.update")
  updateBudgetItem(@Param("publicId") publicId: string, @Param("itemPublicId") itemPublicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.budgetItems.update(publicId, itemPublicId, parseUpdateBudgetItem(body), request.auth!);
  }

  @Delete(":publicId/budget-items/:itemPublicId")
  @RequirePermissions("service_orders.budget.update")
  removeBudgetItem(@Param("publicId") publicId: string, @Param("itemPublicId") itemPublicId: string, @Req() request: AuthRequest) {
    return this.budgetItems.remove(publicId, itemPublicId, request.auth!);
  }

  @Post(":publicId/notes")
  @RequirePermissions("service_orders.update")
  createNote(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.notes.create(publicId, parseCreateServiceOrderNote(body), request.auth!);
  }

  @Delete(":publicId/notes/:notePublicId")
  @RequireAuthenticated()
  removeNote(@Param("publicId") publicId: string, @Param("notePublicId") notePublicId: string, @Req() request: AuthRequest) {
    return this.notes.remove(publicId, notePublicId, request.auth!);
  }

  @Patch(":publicId/operational-situation")
  @RequirePermissions("service_orders.situation.update")
  updateOperationalSituation(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.situations.update(publicId, parseOperationalSituationPatch(body), request.auth!);
  }

  @Put(":publicId/assignments")
  @RequirePermissions("service_orders.assignment.manage")
  replaceAssignments(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.assignments.replace(publicId, parseAssignmentsPut(body), request.auth!);
  }
}
