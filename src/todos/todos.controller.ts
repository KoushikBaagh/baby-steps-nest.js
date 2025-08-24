import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Todo } from './schema/todo.schema';
import { TodosService } from './todos.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';

@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  create(@Body() createTodoDto: CreateTodoDto): Promise<Todo> {
    return this.todosService.create(createTodoDto);
  }

  @Get()
  async findAll(): Promise<Todo[]> {
    return this.todosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Todo | null> {
    return this.todosService.findOneTodo(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTodoDto: UpdateTodoDto) {
    return this.todosService.updateTodo(id, updateTodoDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Todo | null> {
    return this.todosService.delete(id);
  }
}
