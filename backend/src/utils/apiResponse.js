/**
 * Standardized API Response format.
 */
export class ApiResponse {
  constructor(statusCode = 200, message = 'Success', data = null, meta = null) {
    this.success = statusCode >= 200 && statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    if (data !== null && data !== undefined) {
      this.data = data;
    }
    if (meta !== null && meta !== undefined) {
      this.meta = meta;
    }
  }

  static success(res, message = 'Success', data = null, statusCode = 200, meta = null) {
    if (typeof message !== 'string' && (typeof data === 'string' || data === null)) {
      const temp = message;
      message = typeof data === 'string' ? data : 'Success';
      data = temp;
    }
    return res.status(statusCode).json(new ApiResponse(statusCode, message, data, meta));
  }
}

export default ApiResponse;
