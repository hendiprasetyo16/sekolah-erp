// D:\APLIKASI\sekolah-erp\server\src\common\filters\http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const DEFAULT_SERVER_ERROR_MESSAGE = 'Terjadi kesalahan internal server';

// ============================================================================
// DEFINISI TIPE DATA STRICT (TANPA ANY)
// ============================================================================
type ErrorDetails = Record<string, unknown> | unknown[];

interface HttpExceptionResponseBody {
  message?: string | string[];
  errors?: ErrorDetails;
  error?: string;
  statusCode?: number;
}

interface StandardErrorResponse {
  success: false;
  message: string;
  errors?: ErrorDetails;
  statusCode: number;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = DEFAULT_SERVER_ERROR_MESSAGE;
    let errors: ErrorDetails | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resp = exceptionResponse as HttpExceptionResponseBody;

        if (Array.isArray(resp.message) && resp.message.length > 0) {
          message = String(resp.message[0]);
        } else if (
          typeof resp.message === 'string' &&
          resp.message.trim().length > 0
        ) {
          message = resp.message;
        }

        if (resp.errors !== undefined) {
          errors = resp.errors;
        }
      }
    }

    // Log error secara detail saat mode pengembangan (development)
    if (process.env.NODE_ENV === 'development') {
      console.error('[Error]', exception);
    }

    const payload: StandardErrorResponse = {
      success: false,
      message,
      errors,
      statusCode: status,
    };

    response.status(status).json(payload);
  }
}