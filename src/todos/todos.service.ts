import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Todo, TodoDocument } from './schema/todo.schema';
import { CreateTodoDto, UpdateTodoDto } from './dto/todo.dto';

@Injectable()
export class TodosService {
  constructor(@InjectModel(Todo.name) private todoModel: Model<TodoDocument>) {}

  // logic to create a new todo
  async create(createTodoDto: CreateTodoDto): Promise<Todo> {
    const newTodo = new this.todoModel({
      title: createTodoDto.title,
      status: createTodoDto.status || false,
    });
    return newTodo.save();
  }

  // logic to get a single todo by id
  async findOneTodo(_id: string): Promise<Todo | null> {
    // FIND a todo by a document field using MongoDB named `_id`.
    // Note: the below will only work if documents actually have an `id` field.
    // return this.todoModel.findOne({ id }).exec();

    return this.todoModel.findById(_id).exec();
  }
  // logic to update
  async updateTodo(
    _id: string,
    updateTodoDto: UpdateTodoDto,
  ): Promise<Todo | null> {
    return this.todoModel
      .findByIdAndUpdate(_id, updateTodoDto, { new: true })
      .exec();
  }

  // get all todos
  async findAll(): Promise<Todo[]> {
    return await this.todoModel.find().exec();
  }

  async delete(_id: string): Promise<Todo | null> {
    // delete a todo by a document field using MongoDB named `_id`.
    // Note: the below will only work if documents actually have an `id` field.
    // return this.todoModel.findOneAndDelete({ id }).exec();
    return this.todoModel.findByIdAndDelete(_id).exec();
  }
}
