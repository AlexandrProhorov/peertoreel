import {
  GALLERY_CHANNEL,
  buildPreviewMessage,
  parseFrameEvent,
  previewUrl,
} from './gallery-preview';

describe('gallery preview protocol', () => {
  it('builds a preview message on the catalogue channel', () => {
    const message = buildPreviewMessage('label', { text: 'привет' }, 'studio-dark');

    expect(message).toEqual({
      channel: GALLERY_CHANNEL,
      type: 'preview',
      primitiveId: 'label',
      params: { text: 'привет' },
      themeId: 'studio-dark',
    });
    expect(GALLERY_CHANNEL.length).toBeGreaterThan(0);
  });

  it('copies params so later mutations do not leak into the iframe message', () => {
    const params = { text: 'a' };
    const message = buildPreviewMessage('label', params, 'studio-dark');

    params.text = 'b';

    expect(message.params['text']).toBe('a');
  });

  it('accepts a ready signal and drops foreign messages', () => {
    expect(parseFrameEvent({ channel: GALLERY_CHANNEL, type: 'ready' })).toEqual({
      type: 'ready',
    });
    expect(parseFrameEvent({ channel: 'other', type: 'ready' })).toBeNull();
    expect(parseFrameEvent({ channel: GALLERY_CHANNEL, type: 'nope' })).toBeNull();
    expect(parseFrameEvent('ready')).toBeNull();
    expect(parseFrameEvent(null)).toBeNull();
  });

  it('normalizes an error event and its missing message', () => {
    expect(
      parseFrameEvent({ channel: GALLERY_CHANNEL, type: 'error', message: 'boom' }),
    ).toEqual({ type: 'error', message: 'boom' });

    const withoutMessage = parseFrameEvent({
      channel: GALLERY_CHANNEL,
      type: 'error',
    });

    expect(withoutMessage?.type).toBe('error');
  });

  it('resolves the playground against the document base', () => {
    expect(previewUrl('http://localhost/')).toBe(
      'http://localhost/gallery/playground/index.html',
    );
    expect(previewUrl('https://reel.example/app/')).toBe(
      'https://reel.example/app/gallery/playground/index.html',
    );
  });
});
