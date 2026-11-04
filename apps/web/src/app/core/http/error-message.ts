import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@kadence/contracts';

/** Non-throwing status check for flows where 404 is an expected answer. */
export function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof HttpErrorResponse && error.status === status;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const parsed = apiErrorSchema.safeParse(error.error);

    if (parsed.success) {
      return parsed.data.error.message;
    }

    if (error.status === 0) {
      return 'API недоступен. Проверьте, что backend запущен.';
    }

    return `Запрос завершился с ошибкой ${error.status}.`;
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return 'Сервер вернул неожиданный ответ.';
  }

  if (error instanceof Error && error.message === 'SSE connection failed') {
    return 'Не удалось подключиться к потоку статуса.';
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Неизвестная ошибка.';
}
