// Unit тесты
jest.mock("../config/db");
jest.mock("../config/redis");

const Controller = require("../controllers/Controller");
const pool = require("../config/db");
const getRedisClient = require("../config/redis");

const res = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn()
});

describe("Controller", () => {

  afterEach(() => jest.clearAllMocks());

  // Успешное бронирование мероприятия при получении мест из PostgreeSQL
   test("Успешное бронирование", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_seats: 2 }] }) // SELECT event
        .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // COUNT bookings
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] }) // INSERT booking
        .mockResolvedValueOnce(), // COMMIT
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(client);
    getRedisClient.mockReturnValue(null);

    const r = res();

    await Controller.reserve(
      { body: { event_id: 1, user_id: "user1" } },
      r
    );

    expect(r.status).toHaveBeenCalledWith(201);
    expect(r.json).toHaveBeenCalledWith({
      status: "OK",
      booking_id: 10
    });
  });

  // Бронирование при получении мест из кэша Redis
  test("Успешное бронирование — счётчик берётся из Redis", async () => {
  const redisMock = {
    get: jest.fn().mockResolvedValue("1"),
    set: jest.fn()
  };

  getRedisClient.mockReturnValue(redisMock);

  const client = {
    query: jest.fn()
      .mockResolvedValueOnce() // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_seats: 5 }] }) // event
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 42 }] }) // INSERT
      .mockResolvedValueOnce(), // COMMIT
    release: jest.fn()
  };

  pool.connect.mockResolvedValue(client);

  const r = res();

  await Controller.reserve(
    { body: { event_id: 1, user_id: "user1" } },
    r
  );

  expect(redisMock.get).toHaveBeenCalledWith("event:booked:1");
  expect(redisMock.set).toHaveBeenCalledWith(
    "event:booked:1",
    2,
    { EX: 60 }
  );

  expect(r.status).toHaveBeenCalledWith(201);
});

  // Событие для бронирования мероприятия не найдено
  test("Событие не найдено", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }), // SELECT event
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(client);
    getRedisClient.mockReturnValue(null);

    const r = res();

    await Controller.reserve(
      { body: { event_id: 999, user_id: "user1" } },
      r
    );

    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith({
      error: "Событие не найдено"
    });
  });

  // Отсутствие мест для бронирования на мероприятие
  test("Нет свободных мест", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_seats: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: "1" }] }), // COUNT = total
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(client);
    getRedisClient.mockReturnValue(null);

    const r = res();

    await Controller.reserve(
      { body: { event_id: 1, user_id: "user2" } },
      r
    );

    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({
      error: "Нет доступных мест на мероприятие"
    });
  });

  // Повторное бронирование мероприятия одним пользователем
  test("Пользователь уже бронировал", async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_seats: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: "1" }] })
        .mockResolvedValueOnce({ rowCount: 0 }), // INSERT → DO NOTHING
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(client);
    getRedisClient.mockReturnValue(null);

    const r = res();

    await Controller.reserve(
      { body: { event_id: 1, user_id: "user1" } },
      r
    );

    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({
      error: "Пользователь уже забронировал это мероприятие"
    });
  });

});