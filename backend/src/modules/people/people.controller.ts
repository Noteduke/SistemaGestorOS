import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { parseCreatePersonDto } from "./dto/create-person.dto.js";
import { parseListPeopleQuery } from "./dto/list-people-query.dto.js";
import {
  parseCreatePersonEmail,
  parseCreatePersonPhone,
  parsePersonContactListQuery,
} from "./dto/person-contact.dto.js";
import { PeopleService } from "./people.service.js";

@Controller("people")
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.people.create(parseCreatePersonDto(body));
  }

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.people.list(parseListPeopleQuery(query));
  }

  @Get(":publicId")
  getByPublicId(@Param("publicId") publicId: string) {
    return this.people.getByPublicId(publicId);
  }

  @Post(":publicId/phones")
  createPhone(@Param("publicId") publicId: string, @Body() body: unknown) {
    return this.people.createPhone(publicId, parseCreatePersonPhone(body));
  }

  @Get(":publicId/phones")
  listPhones(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>) {
    return this.people.listPhones(publicId, parsePersonContactListQuery(query));
  }

  @Post(":publicId/emails")
  createEmail(@Param("publicId") publicId: string, @Body() body: unknown) {
    return this.people.createEmail(publicId, parseCreatePersonEmail(body));
  }

  @Get(":publicId/emails")
  listEmails(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>) {
    return this.people.listEmails(publicId, parsePersonContactListQuery(query));
  }
}
