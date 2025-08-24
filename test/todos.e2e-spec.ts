import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('TodosController (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        MongooseModule.forRoot(uri),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  it('/todos (POST)', () => {
    return request(app.getHttpServer())
      .post('/todos')
      .send({ id: '1', title: 'Test Todo', completed: false })
      .expect(201)
      .then(response => {
        expect(response.body.title).toEqual('Test Todo');
      });
  });

  it('/todos (GET)', () => {
    return request(app.getHttpServer())
      .get('/todos')
      .expect(200)
      .then(response => {
        expect(Array.isArray(response.body)).toBeTruthy();
      });
  });
});
