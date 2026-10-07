import { Controller, Get, Param, Post, Query, Body } from "@nestjs/common";
import { parseCreatePersonDto } from "./dto/create-person.dto.js";
import { parseListPeopleQuery } from "./dto/list-people-query.dto.js";
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
}
