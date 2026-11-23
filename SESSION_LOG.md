# SESSION LOG

Compact index. Full records live in `docs/sessions/<YYYY-MM>/`.
Start here; open only the record you need. New records are at most 50 lines and
follow `docs/templates/session-record.md`. Theory notes belong in local `LEARNING.md`.

| Date | Session | Record |
| --- | --- | --- |
| 2026-11-23 | Сценарий и слой рисования: четыре узла вместо каталога, чек и табло из геометрии | [2026-11-23-02](docs/sessions/2026-11/2026-11-23-02-draw-language.md) |
| 2026-11-23 | Калибровка 5 тем: 5/5 в окне, 51 сцена; плашка, переполнение и отставание видеоряда закрыты | [2026-11-23-01](docs/sessions/2026-11/2026-11-23-01-calibration-bugs.md) |
| 2026-11-22 | Озвучка как источник времени: строки по 80 символов, обрезка тишины, экранный текст, 68.8 с | [2026-11-22-01](docs/sessions/2026-11/2026-11-22-01-voice-lines.md) |
| 2026-11-21 | Минутный ролик: длинная арка, озвучка Google TTS, субтитры, mux | [2026-11-21-06](docs/sessions/2026-11/2026-11-21-06-minute-film.md) |
| 2026-11-21 | Внешние ответы (8e): Claude и GPT приняты 3/3, Gemini вернул арку | [2026-11-21-05](docs/sessions/2026-11/2026-11-21-05-external-answers.md) |
| 2026-11-21 | Ремонты до KPI: 0 потерянных сцен, 0 % degraded, 1.46 попытки | [2026-11-21-04](docs/sessions/2026-11/2026-11-21-04-repairs-to-kpi.md) |
| 2026-11-21 | Серия DeepSeek (8c) и кадровые проверки (8d): 26/26, degraded 7.7 % | [2026-11-21-03](docs/sessions/2026-11/2026-11-21-03-deepseek-series.md) |
| 2026-11-20 | Кадровые проверки по измерениям и экспорт промптов для внешнего прогона | [2026-11-20-11](docs/sessions/2026-11/2026-11-20-11-frame-checks-and-prompts.md) |
| 2026-11-20 | Ретрай с информацией: подсказки по кодам и повтор композиции | [2026-11-20-10](docs/sessions/2026-11/2026-11-20-10-informed-retry.md) |
| 2026-11-20 | Рост бокса вместо ретрая: сначала место, потом кегль | [2026-11-20-09](docs/sessions/2026-11/2026-11-20-09-grow-boxes.md) |
| 2026-11-20 | Одна палитра: роль вместо hex, чужой оттенок притягивается к теме | [2026-11-20-08](docs/sessions/2026-11/2026-11-20-08-theme-colours.md) |
| 2026-11-20 | Лестница попыток: лучшая по нарушениям и сигнатуре, алиасы словаря | [2026-11-20-07](docs/sessions/2026-11/2026-11-20-07-ladder-and-aliases.md) |
| 2026-11-20 | Fallback-сцена: слова модели на нашем `stage`, видимая метка «наш кадр» | [2026-11-20-06](docs/sessions/2026-11/2026-11-20-06-fallback-scene-mark.md) |
| 2026-11-20 | Bench: структурная сигнатура сцены и перепись словаря по архивам (`ui:bench`) | [2026-11-20-05](docs/sessions/2026-11/2026-11-20-05-ui-bench-signature.md) |
| 2026-11-20 | Переходы сцен: мягкий dissolve + дрейф 1.2 %, рельсы горизонтально | [2026-11-20-04](docs/sessions/2026-11/2026-11-20-04-ui-demo-scene-transitions.md) |
| 2026-11-20 | Сцена не теряется: degraded-сцены, длина из действий, инвариант полноты | [2026-11-20-03](docs/sessions/2026-11/2026-11-20-03-ui-demo-degraded-scenes.md) |
| 2026-11-21 | UI-demo: два ролика по текущей политике длины, генерация + рендер до mp4 | [2026-11-21-01](docs/sessions/2026-11/2026-11-21-01-ui-film-two-topics.md) |
| 2026-11-20 | UI-demo: читаемость кадра под нагрузкой модели (наслоения, паддинг, пустые блоки) | [2026-11-20-02](docs/sessions/2026-11/2026-11-20-02-ui-demo-readability.md) |
| 2026-11-20 | UI-demo: приёмка чужих ответов, salvage, абсолютные линии | [2026-11-20-01](docs/sessions/2026-11/2026-11-20-01-ui-foreign-import.md) |
| 2026-11-18 | UI-галерея в вебе: iframe-песочница примитивов на одном описании с промптом | [2026-11-18-01](docs/sessions/2026-11/2026-11-18-01-ui-gallery-sandbox.md) |
| 2026-11-17 | UI-demo: 10 устройств, контракты, quality-gate, fidelity-слой | [2026-11-17-01](docs/sessions/2026-11/2026-11-17-01-ui-demo-fidelity.md) |
| 2026-11-15 | M3.6b.11: TTS как конфиг прогона (ElevenLabs/Google) | [2026-11-15-07](docs/sessions/2026-11/2026-11-15-07-m3-6b-11-tts-config.md) |
| 2026-11-15 | M3.6b.10: честный прогресс рендера (сцены + ETA) и state guard script | [2026-11-15-06](docs/sessions/2026-11/2026-11-15-06-m3-6b-10-progress-eta.md) |
| 2026-11-15 | M3.6b.7.4: semantic layer — план персонажа и роли | [2026-11-15-04](docs/sessions/2026-11/2026-11-15-04-m3-6b-7-4-semantic-layer.md) |
| 2026-11-15 | M3.6b.7.3: аксессуары (`glasses`, `scarf`, `hat`) и поза `point` | [2026-11-15-03](docs/sessions/2026-11/2026-11-15-03-m3-6b-7-3-aksessuary-i-pose-point.md) |
| 2026-11-15 | M3.6b.7.2: персонаж как слой рецепта и эмоции директора | [2026-11-15-02](docs/sessions/2026-11/2026-11-15-02-m3-6b-7-2-character-in-recipes.md) |
| 2026-11-15 | M3.6b.9: DeepSeek SVG в `episode_plan` через веб-стадию | [2026-11-15-01](docs/sessions/2026-11/2026-11-15-01-m3-6b-9-web-deepseek-visuals.md) |
| 2026-11-14 | M3.6b.8: freeze — `CharacterBlueprint`, acceptance, prune | [2026-11-14-05](docs/sessions/2026-11/2026-11-14-05-m3-6b-8-freeze-blueprint-acceptance-prune.md) |
| 2026-11-14 | Архитектура персонажа и планы веб-интеграции | [2026-11-14-04](docs/sessions/2026-11/2026-11-14-04-arhitektura-personazha-i-plany-veb-integratsii.md) |
| 2026-11-14 | M3.6b.7.1: `cartoon-character` — рига и 5 эмоций | [2026-11-14-03](docs/sessions/2026-11/2026-11-14-03-m3-6b-7-1-cartoon-character.md) |
| 2026-11-14 | M3.6b.6: raster-cutout — PNG-пайплайн резолвера | [2026-11-14-02](docs/sessions/2026-11/2026-11-14-02-m3-6b-6-raster-cutout.md) |
| 2026-11-14 | M3.6b.5.1: структурный guard SVG (плоская проекция) | [2026-11-14-01](docs/sessions/2026-11/2026-11-14-01-m3-6b-5-1-strukturnyy-guard-svg.md) |
| 2026-11-13 | M3.6b.5: тема wifi-wall и acceptance M3.6 (generated subjects, fallback, ledger) | [2026-11-13-02](docs/sessions/2026-11/2026-11-13-02-m3-6b-5-tretya-tema-wifi-wall-i-acceptance.md) |
| 2026-11-13 | DeepSeek SVG v3.1: мастер-промпт и бенчмарк пропорций | [2026-11-13-01](docs/sessions/2026-11/2026-11-13-01-deepseek-svg-v3-1-master-prompt-i-benchmark-proporciy.md) |
| 2026-11-12 | M3.6b.4: числовой PLAN, silhouette rules, think mode | [2026-11-12-06](docs/sessions/2026-11/2026-11-12-06-m3-6b-4-chislovoy-plan-pravila-silueta-think-mode.md) |
| 2026-11-12 | M3.6b.3: preset v2, скругления и стоимость вызовов | [2026-11-12-05](docs/sessions/2026-11/2026-11-12-05-m3-6b-3-muted-preset-v2-i-stoimost-vyzovov.md) |
| 2026-11-12 | M3.6b.2: DeepSeek SVG провайдер, контракты, CLI и пилот | [2026-11-12-04](docs/sessions/2026-11/2026-11-12-04-m3-6b-2-deepseek-svg-provayder-pilot.md) |
| 2026-11-12 | M3.6b.1: provider readiness — alias, ledger, адаптеры | [2026-11-12-02](docs/sessions/2026-11/2026-11-12-02-m3-6b-1-provider-readiness-alias-ledger-adapters.md) |
| 2026-11-12 | DeepSeek SVG: эксперименты с промптом, выбор генератора | [2026-11-12-03](docs/sessions/2026-11/2026-11-12-03-deepseek-svg-eksperimenty-s-promptom-vybor-generatora.md) |
| 2026-11-12 | fix: `The chunk size is invalid` на TikTok `video/init` | [2026-11-12-01](docs/sessions/2026-11/2026-11-12-01-fix-the-chunk-size-is-invalid-na-tiktok-video-init.md) |
| 2026-11-11 | M3.5.1c: episode в UI — превью, режим при создании и ревью | [2026-11-11-01](docs/sessions/2026-11/2026-11-11-01-m3-5-1c-episode-v-ui-prevyu-rezhim-pri-sozdanii-i-revyu.md) |
| 2026-11-11 | M3.5.1b: episode-режим в воркере и `--assets` в рендерере | [2026-11-11-02](docs/sessions/2026-11/2026-11-11-02-m3-5-1b-episode-rezhim-v-vorkere-i-assets-v-renderere.md) |
| 2026-11-11 | Research: DeepSeek SVG вместо fal.ai / Recraft | [2026-11-11-03](docs/sessions/2026-11/2026-11-11-03-research-deepseek-svg-vmesto-fal-ai-recraft.md) |
| 2026-11-11 | M3.5.1a: episode-режим — контракты, БД и выбор стадии | [2026-11-11-04](docs/sessions/2026-11/2026-11-11-04-m3-5-1a-episode-rezhim-kontrakty-bd-i-vybor-stadii.md) |
| 2026-11-11 | Research: fal.ai vs Recraft для slop-фабрики (экономика AI-ассетов) | [2026-11-11-05](docs/sessions/2026-11/2026-11-11-05-research-fal-ai-vs-recraft-dlya-slop-fabriki-ekonomika-ai-asseto.md) |
| 2026-11-11 | M3.6a.1: Asset Library persistence (Drizzle repository + blob store) | [2026-11-11-06](docs/sessions/2026-11/2026-11-11-06-m3-6a-1-asset-library-persistence-drizzle-repository-blob-store.md) |
| 2026-11-11 | M3.6a: Asset Library core, Resolver и style preset | [2026-11-11-07](docs/sessions/2026-11/2026-11-11-07-m3-6a-asset-library-core-resolver-i-style-preset.md) |
| 2026-11-10 | Research: subject assets, нормализация и форматы роликов (ADR-0015) | [2026-11-10-11](docs/sessions/2026-11/2026-11-10-01-research-subject-assets-normalizatsiya-i-formaty-rolikov-adr-0015.md) |
| 2026-11-10 | M3.3: renderer foundation (data-driven Remotion) | [2026-11-10-11](docs/sessions/2026-11/2026-11-10-02-m3-3-renderer-foundation-data-driven-remotion.md) |
| 2026-11-10 | Roadmap reset: renderer-first, recipes, end-to-end | [2026-11-10-11](docs/sessions/2026-11/2026-11-10-03-roadmap-reset-renderer-first-recipes-end-to-end.md) |
| 2026-11-10 | M3.5: End-to-end animation spike на двух темах | [2026-11-10-04](docs/sessions/2026-11/2026-11-10-04-m3-5-end-to-end-animation-spike-na-dvuh-temah.md) |
| 2026-11-10 | M3.4: Scene Recipes v1, слои и локальный starter SVG | [2026-11-10-05](docs/sessions/2026-11/2026-11-10-05-m3-4-scene-recipes-v1-sloi-i-lokalnyy-starter-svg.md) |
| 2026-11-09 | AGENTS.md: разбивка по приложениям | [2026-11-09-11](docs/sessions/2026-11/2026-11-09-01-agents-md-razbivka-po-prilozheniyam.md) |
| 2026-11-09 | M3.2: render worker на Remotion + рендер фикстуры «−15°» | [2026-11-09-11](docs/sessions/2026-11/2026-11-09-02-m3-2-render-worker-na-remotion-render-fikstury-15.md) |
| 2026-11-09 | M3.1: контракт раскадровки `peertoreel.storyboard.v1` + фикстура «−15°» | [2026-11-09-11](docs/sessions/2026-11/2026-11-09-03-m3-1-kontrakt-raskadrovki-peertoreel-storyboard-v1-fikstura-15.md) |
| 2026-11-08 | fix(web): убрать протухающий Vite-кэш для `@peertoreel/contracts` | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-01-fix-web-ubrat-protuhayuschiy-vite-kesh-dlya-peertoreel-contracts.md) |
| 2026-11-08 | M1.2b: очередь публикации + кнопка в publish card | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-02-m1-2b-ochered-publikatsii-knopka-v-publish-card.md) |
| 2026-11-08 | Web: компоненты без конструкторов, публичный API сторов — `void` | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-03-web-komponenty-bez-konstruktorov-publichnyy-api-storov-void.md) |
| 2026-11-08 | M1.2a: живая загрузка в TikTok | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-04-m1-2a-zhivaya-zagruzka-v-tiktok.md) |
| 2026-11-08 | fix(accounts): PKCE для TikTok OAuth | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-05-fix-accounts-pkce-dlya-tiktok-oauth.md) |
| 2026-11-08 | Переименование Kadence → Peer to Reel | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-06-pereimenovanie-kadence-peer-to-reel.md) |
| 2026-11-08 | Roadmap M3 «Animated Factory» + план для агентов | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-07-roadmap-m3-animated-factory-plan-dlya-agentov.md) |
| 2026-11-08 | Исследование: программная анимация + AI video generation (research only) | [2026-11-08-11](docs/sessions/2026-11/2026-11-08-08-issledovanie-programmnaya-animatsiya-ai-video-generation-researc.md) |
| 2026-11-07 | M1.2a TikTok OAuth + token vault + upload spike | [2026-11-07-11](docs/sessions/2026-11/2026-11-07-01-m1-2a-tiktok-oauth-token-vault-upload-spike.md) |
| 2026-11-06 | M1.1 Publish card + manual export | [2026-11-06-11](docs/sessions/2026-11/2026-11-06-01-m1-1-publish-card-manual-export.md) |
| 2026-11-05 | M2.5 QC + review gate | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-01-m2-5-qc-review-gate.md) |
| 2026-11-05 | feat(web): иерархия действий на run-странице | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-02-feat-web-ierarhiya-deystviy-na-run-stranitse.md) |
| 2026-11-05 | feat(visuals): anchor + tags + relevance ranking, убрана кнопка «Перерендерить» | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-03-feat-visuals-anchor-tags-relevance-ranking-ubrana-knopka-pereren.md) |
| 2026-11-05 | fix(worker): пропуски озвучки на границах сцен | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-04-fix-worker-propuski-ozvuchki-na-granitsah-stsen.md) |
| 2026-11-05 | fix(web): рабочие кнопки регенерации | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-05-fix-web-rabochie-knopki-regeneratsii.md) |
| 2026-11-05 | fix(web): черновик над историей, без встроенных плееров для сцен | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-06-fix-web-chernovik-nad-istoriey-bez-vstroennyh-pleerov-dlya-stsen.md) |
| 2026-11-05 | M2.4 Стадия `visuals` (Pixabay) и render из реальных сцен | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-07-m2-4-stadiya-visuals-pixabay-i-render-iz-realnyh-stsen.md) |
| 2026-11-05 | Закрытие M0 и актуализация документации | [2026-11-05-11](docs/sessions/2026-11/2026-11-05-08-zakrytie-m0-i-aktualizatsiya-dokumentatsii.md) |
| 2026-11-04 | fix(ci): typecheck падал на свежем checkout | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-01-fix-ci-typecheck-padal-na-svezhem-checkout.md) |
| 2026-11-04 | Рефакторинг web data layer (ADR-0007) | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-02-refaktoring-web-data-layer-adr-0007.md) |
| 2026-11-04 | M2.3 Стадия `render` в очереди (цикл замкнут до REVIEW) | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-03-m2-3-stadiya-render-v-ocheredi-tsikl-zamknut-do-review.md) |
| 2026-11-04 | Настоящая причина «залипающей» кнопки: редирект-петля | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-04-nastoyaschaya-prichina-zalipayuschey-knopki-redirekt-petlya.md) |
| 2026-11-04 | Фикс кодировки после PowerShell-правок | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-05-fiks-kodirovki-posle-powershell-pravok.md) |
| 2026-11-04 | Фикс «залипающей» кнопки «Все прогоны» | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-06-fiks-zalipayuschey-knopki-vse-progony.md) |
| 2026-11-04 | M2.1c Кнопки стадий и прогресс в UI | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-07-m2-1c-knopki-stadiy-i-progress-v-ui.md) |
| 2026-11-04 | M2.1b Артефакты в UI | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-08-m2-1b-artefakty-v-ui.md) |
| 2026-11-04 | M2.2 Стадии `script` и `voiceover` в очереди (слайс B) | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-09-m2-2-stadii-script-i-voiceover-v-ocheredi-slays-b.md) |
| 2026-11-04 | M2.1 Storage + artifacts (слайс A) | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-10-m2-1-storage-artifacts-slays-a.md) |
| 2026-11-04 | S0.6 Script generation (R2b): тема → скрипт → видео | [2026-11-04-11](docs/sessions/2026-11/2026-11-04-11-s0-6-script-generation-r2b-tema-skript-video.md) |
| 2026-11-03 | S0.5 Render + TTS spike (R1 / R2a) | [2026-11-03-11](docs/sessions/2026-11/2026-11-03-01-s0-5-render-tts-spike-r1-r2a.md) |
| 2026-11-03 | S0.4b Reviewer gate UI | [2026-11-03-11](docs/sessions/2026-11/2026-11-03-02-s0-4b-reviewer-gate-ui.md) |
| 2026-11-03 | S0.4a Run state machine (API) | [2026-11-03-11](docs/sessions/2026-11/2026-11-03-03-s0-4a-run-state-machine-api.md) |
| 2026-11-03 | S0.3 Auth + sessions + baseline schema | [2026-11-03-11](docs/sessions/2026-11/2026-11-03-04-s0-3-auth-sessions-baseline-schema.md) |
| 2026-11-02 | Drizzle foundation | [2026-11-02-11](docs/sessions/2026-11/2026-11-02-01-drizzle-foundation.md) |
| 2026-11-02 | S0.2a Worker + BullMQ + ping job | [2026-11-02-11](docs/sessions/2026-11/2026-11-02-02-s0-2a-worker-bullmq-ping-job.md) |
| 2026-11-02 | S0.2b SSE progress + web ping UI | [2026-11-02-11](docs/sessions/2026-11/2026-11-02-03-s0-2b-sse-progress-web-ping-ui.md) |
| 2026-11-01 | Angular feature structure: api/ + data-access/ | [2026-11-01-11](docs/sessions/2026-11/2026-11-01-01-angular-feature-structure-api-data-access.md) |
| 2026-10-30 | S0.1 Bootstrap & health vertical slice | [2026-10-30-10](docs/sessions/2026-10/2026-10-30-01-s0-1-bootstrap-health-vertical-slice.md) |
