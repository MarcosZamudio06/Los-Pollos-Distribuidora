import { FiscalArtifactController } from './fiscal-artifact.controller';

describe('FiscalArtifactController', () => {
  it('generates a scoped XML signed URL without returning storage keys', async () => {
    const service = {
      getDownloadUrl: jest.fn().mockResolvedValue({
        invoiceId: 'invoice-1',
        artifactType: 'XML',
        mimeType: 'application/xml',
        sizeBytes: '10',
        sha256: 'a'.repeat(64),
        expiresInSeconds: 300,
        url: 'https://objects.example.test/signed',
      }),
    };
    const controller = new FiscalArtifactController(service as never);

    await expect(
      controller.xml('invoice-1', {
        id: 'billing-1',
        role: 'BILLING',
      } as never),
    ).resolves.toEqual({
      success: true,
      message: 'Fiscal XML download URL generated successfully',
      data: expect.objectContaining({
        artifactType: 'XML',
        url: 'https://objects.example.test/signed',
      }),
    });
    expect(service.getDownloadUrl).toHaveBeenCalledWith(
      'invoice-1',
      'XML',
      expect.objectContaining({ id: 'billing-1', role: 'BILLING' }),
    );
  });

  it('generates PDF through the same RBAC and ownership service boundary', async () => {
    const service = {
      getDownloadUrl: jest.fn().mockResolvedValue({
        invoiceId: 'invoice-1',
        artifactType: 'PDF',
        mimeType: 'application/pdf',
        sizeBytes: '10',
        sha256: 'b'.repeat(64),
        expiresInSeconds: 300,
        url: 'https://objects.example.test/signed-pdf',
      }),
    };
    const controller = new FiscalArtifactController(service as never);

    await expect(
      controller.pdf('invoice-1', {
        id: 'seller-1',
        role: 'SELLER',
      } as never),
    ).resolves.toEqual({
      success: true,
      message: 'Fiscal PDF download URL generated successfully',
      data: expect.objectContaining({ artifactType: 'PDF' }),
    });
  });
});
