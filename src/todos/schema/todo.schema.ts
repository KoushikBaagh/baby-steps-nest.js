import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TodoDocument = HydratedDocument<Todo>;

@Schema()
export class Todo {
  @Prop()
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: false })
  status: boolean;
}

export const TodoSchema = SchemaFactory.createForClass(Todo);

// Alternatively, if you prefer not using decorators, you can define a schema manually. For example:

// export const CatSchema = new mongoose.Schema({
//   name: String,
//   age: Number,
//   breed: String,
// });
