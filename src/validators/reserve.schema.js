// Схема валидации данных на вход
module.exports = {
  type: "object",
  properties: {
    event_id: {
      type: "integer",
      minimum: 1
    },
    user_id: {
      type: "string",
      minimum: 1
    }
  },
  required: ["event_id", "user_id"],
  additionalProperties: false
};