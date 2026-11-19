import {
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  STORYBOARD_RECIPES,
  type RecipeSlotKind,
} from '@peertoreel/contracts';

interface PromptSlot {
  name: string;
  kind: RecipeSlotKind;
  required: boolean;
  shape: string;
}

interface PromptRecipe {
  id: string;
  purpose: string;
  requiredSlots: readonly string[];
  optionalSlots: readonly string[];
  slots: PromptSlot[];
  variants: Array<{ id: string; label: string }>;
}

function slotShape(kind: RecipeSlotKind): string {
  switch (kind) {
    case 'text':
      return 'русская строка';
    case 'subject':
      return '{"assetKey":"<стартовый ключ | subject/slug>","fallbackIcon":"<стартовый ключ | null>","prompt":"<русское описание предмета | null>"}';
    case 'metric':
      return '{"label":"...","value":"...","fraction":0.0-1.0}';
    case 'steps':
      return '[{"label":"...","detail":"..."}] (2-4 шага)';
    case 'character':
      return 'слот не заполняй: ведущего задавай полем characterPlan сцены {"entity":"...","strategy":"transformation","accessories":["glasses"|"scarf"|"hat"]}';
  }
}

/** Compact, data-derived catalog for the director prompt. */
export function storyboardPromptCatalog(): PromptRecipe[] {
  return STORYBOARD_RECIPES.map((recipe) => ({
    id: recipe.id,
    purpose: recipe.purpose,
    requiredSlots: recipe.requiredSlots,
    optionalSlots: recipe.optionalSlots,
    slots: recipe.slotSpecs.map((spec) => ({
      name: spec.name,
      kind: spec.kind,
      required: spec.required,
      shape: slotShape(spec.kind),
    })),
    variants: recipe.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
    })),
  }));
}

export function storyboardPromptStarterAssets(): Array<{
  key: string;
  tags: readonly string[];
}> {
  return STARTER_ASSET_KEYS.map((key) => ({
    key,
    tags: STARTER_ASSET_CATALOG[key].tags,
  }));
}

export function storyboardSystemPrompt(): string {
  return [
    'Ты режиссёр вертикальных научно-популярных роликов (1080x1920, 30 fps) для Peer to Reel.',
    'Ты не пишешь код, не назначаешь тайминги и не придумываешь ассеты.',
    'Ты возвращаешь ТОЛЬКО один JSON-объект без markdown и пояснений:',
    '{"title":"...","scenes":[{"id":"latin-slug","part":"hook|beat|cta","text":"...","description":"...","recipeId":"...","variant":"...","slots":{...},"characterPlan":{"entity":"...","strategy":"transformation","accessories":["glasses"|"scarf"|"hat"]}}]}',
    '',
    'Правила:',
    '- 5–7 сцен: первая strict hook, последняя strict cta, между ними только beat.',
    '- 75–100 слов озвучки на весь ролик (30–60 секунд), 10–18 слов в сцене.',
    '- text — это ровно то, что произносит диктор: живой русский, без markdown, номеров сцен и ремарок.',
    '- description — короткая производственная заметка, что видно на экране; её не озвучивают.',
    '- Используй минимум 3 разных recipeId; это должен быть связный сюжет, а не набор карточек.',
    '- Для предметной темы нужен минимум один subject-слот.',
    '- Главный предмет темы всегда задавай как "subject/<латинский-slug>" с fallbackIcon (ближайший стартовый ключ) и prompt — русское описание предмета: фронтальная проекция (анфас или сбоку), форма, части. Без подписей, букв и цифр; без ракурсов, изометрии и вида сверху.',
    '- Стартовый ключ в assetKey бери только для второстепенной детали, которую не нужно рисовать заново; тогда fallbackIcon и prompt — null.',
    '- recipeId, variant и slots бери только из каталога. Неизвестный стартовый ключ в fallbackIcon — ошибка.',
    '- Никаких выдуманных полей, путей и URL.',
    '- Для сравнений используй metric (fraction 0..1), для процессов — steps (2–4 шага).',
    '- Персонаж: только там, где в каталоге у рецепта есть слот character, и максимум один персонаж на сцену. Вместо слота возвращай поле сцены characterPlan {"entity":"кто это","strategy":"transformation","accessories":[...]}; слот character заполнять нельзя — его собирает код.',
    '- characterPlan.entity — кто ведёт сцену, одной короткой фразой (1–80 символов): роль, профессия или типаж. Без внешности, одежды, цветов и координат.',
    '- Эмоцию, позу, anchor, координаты и названия частей тела не указывай: их жёстко задаёт часть сцены (hook — surprised/idle, beat — neutral/idle, cta — happy/wave).',
    '- strategy всегда "transformation": standalone_character не поддерживается рендерером и будет отклонён.',
    '- Аксессуары (glasses, scarf, hat) в characterPlan необязательны: максимум два, без повторов; не добавляй их, если они не помогают смыслу.',
    '- Не проси нарисовать схему с подписями: подписи и числа рисует Remotion из слотов.',
    '- id сцены — уникальный латинский slug (например, "wet-nose-hook").',
  ].join('\n');
}

export function storyboardUserPrompt(topic: string): string {
  return [
    `Тема ролика: ${topic}`,
    '',
    'Каталог рецептов (recipeId → variants и слоты):',
    JSON.stringify(storyboardPromptCatalog(), null, 2),
    '',
    'Стартовые ассеты (ключи для subject.assetKey и fallbackIcon):',
    JSON.stringify(storyboardPromptStarterAssets(), null, 2),
    '',
    'Собери раскадровку под эту тему. Верни только JSON по системной схеме.',
  ].join('\n');
}
