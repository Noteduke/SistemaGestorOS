import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { parseCreatePersonDto } from "./dto/create-person.dto.js";
import { parseListPeopleQuery } from "./dto/list-people-query.dto.js";
import {
  parseCreatePersonEmail,
  parseCreatePersonPhone,
  parsePersonContactListQuery,
} from "./dto/person-contact.dto.js";
import { PeopleService } from "./people.service.js";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { parseOpeningLookupQuery } from "../shared/dto/opening-lookup-query.dto.js";

@Controller("people")
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Post()
  @RequirePermissions("people.create")
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.people.createCompletePerson(body, request.auth!.id);
  }

  @Get()
  @RequirePermissions("people.read")
  list(@Query() query: Record<string, unknown>) {
    return this.people.list(parseListPeopleQuery(query));
  }

  @Get("customers")
  @RequirePermissions("service_orders.opening.create")
  listOpeningCustomers(@Query() query: Record<string, unknown>) {
    return this.people.listOpeningCustomers(parseOpeningLookupQuery(query));
  }

  @Post("customers")
  @RequirePermissions("people.create", "service_orders.opening.create")
  createOpeningCustomer(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.people.createOpeningCustomer(body, request.auth!.id);
  }

  @Get("customers/opening/:openingId")
  @RequirePermissions("service_orders.opening.create")
  getOpeningCustomer(@Param("openingId") openingId: string, @Req() request: AuthRequest) {
    return this.people.getOpeningCustomerDetails(openingId, request.auth!.id);
  }

  @Patch("customers/opening/:openingId")
  @RequirePermissions("service_orders.opening.create", "people.update", "people.contacts.add")
  updateOpeningCustomer(@Param("openingId") openingId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.people.updateOpeningCustomerDetails(openingId, request.auth!.id, body);
  }

  @Get(":publicId")
  @RequirePermissions("people.read")
  getByPublicId(@Param("publicId") publicId: string) {
    return this.people.getByPublicId(publicId);
  }

  @Post(":publicId/phones")
  @RequirePermissions("people.contacts.add")
  createPhone(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.people.createPhone(publicId, parseCreatePersonPhone(body), request.auth!.id);
  }

  @Get(":publicId/phones")
  @RequirePermissions("people.contacts.read")
  listPhones(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>) {
    return this.people.listPhones(publicId, parsePersonContactListQuery(query));
  }

  @Post(":publicId/emails")
  @RequirePermissions("people.contacts.add")
  createEmail(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.people.createEmail(publicId, parseCreatePersonEmail(body), request.auth!.id);
  }

  @Get(":publicId/emails")
  @RequirePermissions("people.contacts.read")
  listEmails(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>) {
    return this.people.listEmails(publicId, parsePersonContactListQuery(query));
  }
}
