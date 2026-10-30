import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@kadence/contracts';

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

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Неизвестная ошибка.';
}
