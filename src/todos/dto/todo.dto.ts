import { PartialType } from '@nestjs/swagger';

export class CreateTodoDto {
  title: string;
  status?: boolean;
}

export class UpdateTodoDto extends PartialType(CreateTodoDto) {}
