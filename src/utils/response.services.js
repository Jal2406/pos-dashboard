// utils/response.services.js
class ResponseService {
  static send(res, statusCode, message, data = null) {
    const response = {
      message,
      status: statusCode,
    };
    if (data) {
      response.data = data;
    }

    res.status(statusCode).json(response);
  }
}

export default ResponseService;
