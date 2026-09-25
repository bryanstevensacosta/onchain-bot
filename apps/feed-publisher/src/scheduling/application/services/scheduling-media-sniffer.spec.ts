import {
  extensionForMimeType,
  sniffSchedulingMimeType,
} from './scheduling-media-sniffer';

describe('scheduling-media-sniffer', () => {
  it('sniffs image and video signatures, never trusting the client', () => {
    expect(
      sniffSchedulingMimeType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(
      sniffSchedulingMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])),
    ).toBe('image/jpeg');
    expect(
      sniffSchedulingMimeType(
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      ),
    ).toBe('image/gif');
    expect(
      sniffSchedulingMimeType(
        Buffer.from([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
      ),
    ).toBe('image/webp');
    expect(
      sniffSchedulingMimeType(
        Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
      ),
    ).toBe('video/mp4');
    expect(sniffSchedulingMimeType(Buffer.from('plain text bytes'))).toBe(
      'application/octet-stream',
    );
  });

  it('maps mime types to file extensions', () => {
    expect(extensionForMimeType('image/png')).toBe('.png');
    expect(extensionForMimeType('video/mp4')).toBe('.mp4');
    expect(extensionForMimeType('application/octet-stream')).toBe('.bin');
  });
});
