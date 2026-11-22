/**
 * A retry is only worth its tokens when it says what to change.
 *
 * The schema rejects with a code; the model needs a sentence it can act on. The
 * table maps codes to "how to express it", and the message keeps the code so a
 * log still reads like a log.
 *
 * Codes come from two places: the composition validator (`unknown-transition`,
 * `typography-fit`) and the quality gate, which is embedded in the schema
 * message as `quality/<code>: ...`.
 */
const HINTS: Readonly<Record<string, string>> = {
  'unknown-primitive':
    'такого примитива нет: выбери из stage, card, pill, bubble, avatar, object, label, thumb, track, grid, line',
  'unknown-parameter':
    'у этого примитива нет такого свойства: возьми имя из списка параметров примитива, а не из другого',
  'unknown-transition':
    'такого перехода у примитива нет: посмотри его список переходов; операция (move, scale) в sequence не пишется',
  'unknown-state': 'такого состояния у примитива нет: состояния перечислены в контракте примитива',
  'unknown-operation': 'такой операции у примитива нет: посмотри список операций',
  'transition-dropped': 'переход удалён из sequence: посмотри список переходов примитива',
  'dangling-link': 'link ссылается на несуществующий id: укажи id элемента этой же сцены',
  'element-budget': 'элементов больше предела: оставь только то, что несёт смысл',
  'primitive-budget': 'одних и тех же примитивов слишком много: замени часть другим приёмом',
  'text-not-supported': 'текст живёт только в label, pill, bubble и card; у фигуры его нет',
  'typography-fit':
    'текст не влезает в бокс на минимальном кегле: сократи фразу или увеличь бокс — кегль ниже минимума не читается',
  'grid-overlap': 'текст на ячейках сетки не читается: убери текст с grid или убери сетку под ним',
  'surface-overlap':
    'две поверхности с текстом пересекаются: разведи их по вертикали или сократи одну',
  'track-outside-content':
    'рельса выходит за поля кадра: сократи length или сдвинь x так, чтобы x + length укладывалось в 72..1008',
  'quality:accent-required':
    'нужен один акцент: поставь focus на элемент с заливкой accent или дай акцентную поверхность',
  'quality:text-contrast':
    'текст не читается на своём фоне: выбери роль ink, muted или accent-ink под заливку',
  'quality:empty-surface':
    'поверхность без текста и без содержимого — дырка в кадре: дай подпись или убери её',
  'quality:density': 'сцене не хватает содержания: нужен смысловой элемент и поверхность под ним',
  'quality:hierarchy-required':
    'нужен один крупный токен — display, headline, card или selection: главный смысл должен читаться первым',
  'quality:surface-visible':
    'поверхность не отличается от фона темы: ей нужна заливка surface или accent',
  'quality:style-required': 'у текста нет стиля: задай token, а тон или цвет наследуй от темы',
};

/** `quality/text-contrast: ...` and `grid-overlap: ...` are both codes with detail. */
export function codeOf(message: string): string | null {
  const match = /^(?<code>[a-z][a-z:/-]*):/.exec(message.trim());
  const code = match?.groups?.['code'];

  return code === undefined ? null : code;
}

export function hintFor(code: string | null): string | null {
  return code === null ? null : (HINTS[code] ?? null);
}

/** One line per issue: the original message plus what to do about it. */
export function issuesWithHints(messages: readonly string[]): string[] {
  return messages.map((message) => {
    const hint = hintFor(codeOf(message));

    return hint === null ? message : `${message} — ${hint}`;
  });
}

/** The model repeated the same composition two attempts in a row. */
export const REPEATED_COMPOSITION =
  'композиция повторилась: измени набор примитивов или их расположение, а не слова';
