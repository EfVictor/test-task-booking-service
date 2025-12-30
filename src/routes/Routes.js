const express = require("express");
const controllers = require("../controllers/Controller");             // Здесь описаны все контроллеры
const validateReserve = require("../middlewares/validateReserve");    // Мидлварка для валидации входных данных

const router = express.Router();

router.post("/bookings/reserve", validateReserve, controllers.reserve) // Маршрут для для бронирования места на мероприятие
router.get("/bookings/", controllers.emptyQuery)                       // Маршрут для пустого запроса

module.exports = router;