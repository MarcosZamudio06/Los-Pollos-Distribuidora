import {
  SAT_CFDI_FALLBACK_SOURCE_URL,
  SAT_CFDI_USES,
  SAT_FISCAL_COMPATIBILITY_FALLBACK,
  SAT_FISCAL_REGIMES,
  isCfdiUseCompatible,
  type SatFiscalCompatibilityCatalog,
} from '../../../../shared/fiscal-catalog';

describe('SAT CFDI compatibility fallback contract', () => {
  const regimeCodes = new Set(SAT_FISCAL_REGIMES.map((entry) => entry.code));

  it('keeps the complete reviewed fallback catalogs free of duplicate codes', () => {
    expect(SAT_FISCAL_REGIMES).toHaveLength(19);
    expect(SAT_CFDI_USES).toHaveLength(24);
    expect(new Set(SAT_FISCAL_REGIMES.map((entry) => entry.code)).size).toBe(
      SAT_FISCAL_REGIMES.length,
    );
    expect(new Set(SAT_CFDI_USES.map((entry) => entry.code)).size).toBe(
      SAT_CFDI_USES.length,
    );
  });

  it('requires explicit person applicability and coherent validity metadata', () => {
    for (const entry of [...SAT_FISCAL_REGIMES, ...SAT_CFDI_USES]) {
      expect(typeof entry.appliesTo.physical).toBe('boolean');
      expect(typeof entry.appliesTo.moral).toBe('boolean');
      expect(entry.appliesTo.physical || entry.appliesTo.moral).toBeTruthy();
      expect(Date.parse(entry.validFrom ?? '')).not.toBeNaN();
      if (entry.validTo) {
        expect(Date.parse(entry.validTo)).toBeGreaterThan(
          Date.parse(entry.validFrom ?? ''),
        );
      }
    }
  });

  it('requires every UsoCFDI regime reference to exist in c_RegimenFiscal', () => {
    for (const entry of SAT_CFDI_USES) {
      expect(entry.fiscalRegimes.length).toBeGreaterThan(0);
      expect(new Set(entry.fiscalRegimes).size).toBe(
        entry.fiscalRegimes.length,
      );
      for (const regimeCode of entry.fiscalRegimes) {
        expect(regimeCodes.has(regimeCode)).toBe(true);
      }
    }
  });

  it('enforces person type, regime and UsoCFDI together', () => {
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'G03',
        fiscalRegime: '601',
        receiverPersonType: 'moral',
        effectiveDate: new Date('2026-08-30T12:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'D01',
        fiscalRegime: '605',
        receiverPersonType: 'physical',
      }),
    ).toBe(true);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'G03',
        fiscalRegime: '616',
        receiverPersonType: 'physical',
      }),
    ).toBe(false);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'D01',
        fiscalRegime: '601',
        receiverPersonType: 'moral',
      }),
    ).toBe(false);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'CN01',
        fiscalRegime: '605',
        receiverPersonType: 'physical',
      }),
    ).toBe(true);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'CN01',
        fiscalRegime: '605',
        receiverPersonType: 'moral',
      }),
    ).toBe(false);
  });

  it('keeps generic RFC exceptions explicit and date-aware', () => {
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'S01',
        fiscalRegime: '616',
        receiverPersonType: 'generic',
        receiverTaxId: 'XAXX010101000',
      }),
    ).toBe(true);
    expect(
      isCfdiUseCompatible({
        cfdiUse: 'G03',
        fiscalRegime: '616',
        receiverPersonType: 'generic',
        receiverTaxId: 'XEXX010101000',
      }),
    ).toBe(false);

    const dateBoundedCatalog: SatFiscalCompatibilityCatalog = {
      fiscalRegimes: [
        {
          ...SAT_FISCAL_REGIMES[0],
          validFrom: '2027-01-01',
          validTo: '2028-01-01',
        },
      ],
      cfdiUses: [
        {
          ...SAT_CFDI_USES[2],
          validFrom: '2027-01-01',
          validTo: '2028-01-01',
          fiscalRegimes: ['601'],
        },
      ],
    };
    expect(
      isCfdiUseCompatible(
        {
          cfdiUse: 'G03',
          fiscalRegime: '601',
          receiverPersonType: 'moral',
          effectiveDate: new Date('2026-12-31T23:59:59.999Z'),
        },
        dateBoundedCatalog,
      ),
    ).toBe(false);
    expect(
      isCfdiUseCompatible(
        {
          cfdiUse: 'G03',
          fiscalRegime: '601',
          receiverPersonType: 'moral',
          effectiveDate: new Date('2027-01-01T00:00:00.000Z'),
        },
        dateBoundedCatalog,
      ),
    ).toBe(true);
  });

  it('uses one shared fallback projection as the reproducible static source', () => {
    expect(SAT_FISCAL_COMPATIBILITY_FALLBACK.cfdiUses).toBe(SAT_CFDI_USES);
    expect(SAT_FISCAL_COMPATIBILITY_FALLBACK.fiscalRegimes).toBe(
      SAT_FISCAL_REGIMES,
    );
    expect(SAT_CFDI_FALLBACK_SOURCE_URL).toContain('sat.gob.mx');
  });
});
