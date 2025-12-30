const pool = require("../config/db");
const getRedisClient = require("../config/redis");

// Контроллер для бронирования места на мероприятие
exports.reserve = async (req, res) => {
  const { event_id, user_id} = req.body;

  // Работа с базой данных
  const client = await pool.connect();
  const redis = getRedisClient();
  try {
    await client.query("BEGIN");

    // Проверка события + блокировка
    const eventRes = await client.query(
      "SELECT total_seats FROM events WHERE id = $1 FOR UPDATE",
      [event_id]
    );

    // Проверка существования мероприятия
    if (eventRes.rowCount === 0) {
      throw new Error("EVENT_NOT_FOUND");
    }

    const totalSeats = eventRes.rows[0].total_seats;

    let bookedCount;

    // Если клиент Redis существует - получение количества доступных мест из него
    if (redis) {
      const cached = await redis.get(`event:booked:${event_id}`);
      if (cached !== null) {
        bookedCount = Number(cached);
      }
    }

    // Если клиент Redis не существует — получаем из БД
    if (bookedCount === undefined) {
      const countRes = await client.query(
        "SELECT COUNT(*) FROM bookings WHERE event_id = $1",
        [event_id]
      );
      bookedCount = Number(countRes.rows[0].count);
    }

    // Проверка на доступность мест на мероприятие
    if (bookedCount >= totalSeats) {
      throw new Error("NO_SEATS");
    }

    // Попытка вставки бронирования
    const bookingRes = await client.query(
      `INSERT INTO bookings (event_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (event_id, user_id)
       DO NOTHING
       RETURNING id`,
      [event_id, user_id]
    );

    if (bookingRes.rowCount === 0) {
      throw new Error("ALREADY_BOOKED");
    }

    await client.query("COMMIT");

    // Запись кэша в Redis
    if (redis) {
      try {
        await redis.set(`event:booked:${event_id}`, bookedCount + 1, { EX: 60 });
      } catch (err) {
        console.warn("Команда Redis SET завершилась неудачей:", err.message);
      }
    }

    // Возврат ответа клиенту
    res.status(201).json({
      status: "OK",
      booking_id: bookingRes.rows[0].id
    });
  } catch (err) {
      await client.query("ROLLBACK");

       if (err.message === "EVENT_NOT_FOUND") {
      return res.status(404).json({ error: "Событие не найдено" });
    }

    if (err.message === "NO_SEATS") {
      return res.status(409).json({ error: "Нет доступных мест на мероприятие" });
    }

    if (err.message === "ALREADY_BOOKED") {
      return res.status(409).json({ error: "Пользователь уже забронировал это мероприятие" });
    }

      console.error(err);
      res.status(500).json({ error: "Внутренняя ошибка сервера" });
  } finally {
      client.release();
  }
};

// Контроллер для пустого запроса. В данном случае HEALTH CHECK
exports.emptyQuery = async (req, res) => {
  res.status(200).json({
      status: "ОК",
      message: "Версия сервиса: 1.0"
  });
};