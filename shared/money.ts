export type RoundingMode = "HALF_UP";

export type DecimalInput = string | number | { toString(): string };
type MoneyInput = DecimalInput | Money | null | undefined;

type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseDecimal(value: DecimalInput): ParsedDecimal {
  const raw = typeof value === "number" ? String(value) : value.toString();
  const normalized = raw.trim();

  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error(`Invalid decimal value: ${raw}`);
  }

  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [integerPart, fractionalPart = ""] = unsigned.split(".");
  const digits =
    `${integerPart || "0"}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";

  return {
    coefficient: sign * BigInt(digits),
    scale: fractionalPart.length,
  };
}

function roundFraction(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n)
    throw new Error("Decimal denominator must be positive");

  const sign = numerator < 0n ? -1n : 1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const quotient = absoluteNumerator / denominator;
  const remainder = absoluteNumerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;

  return sign * rounded;
}

function pow10(scale: number): bigint {
  return 10n ** BigInt(scale);
}

function canonicalMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole.toString()}.${fraction}`;
}

function decimalToString(value: DecimalInput): string {
  const parsed = parseDecimal(value);
  const denominator = pow10(parsed.scale);
  const integer = roundFraction(parsed.coefficient * 100n, denominator);
  return canonicalMoney(integer);
}

/**
 * Exact monetary value for MXN. Arithmetic is performed with integer cents;
 * non-monetary decimal factors are parsed as decimal strings before use.
 */
export class Money {
  private readonly cents: bigint;

  private constructor(cents: bigint) {
    this.cents = cents;
  }

  static zero(): Money {
    return new Money(0n);
  }

  static from(value: DecimalInput | Money | null | undefined): Money {
    if (value === null || value === undefined) return Money.zero();
    if (value instanceof Money) return value;

    const parsed = parseDecimal(value);
    return new Money(
      roundFraction(parsed.coefficient * 100n, pow10(parsed.scale)),
    );
  }

  static sum(values: Iterable<MoneyInput>): Money {
    let result = Money.zero();
    for (const value of values) result = result.add(Money.from(value));
    return result;
  }

  add(value: MoneyInput): Money {
    return new Money(this.cents + Money.from(value).cents);
  }

  subtract(value: MoneyInput): Money {
    return new Money(this.cents - Money.from(value).cents);
  }

  multiply(factor: DecimalInput): Money {
    const parsed = parseDecimal(factor);
    return new Money(
      roundFraction(this.cents * parsed.coefficient, pow10(parsed.scale)),
    );
  }

  percentage(percentage: DecimalInput): Money {
    const parsed = parseDecimal(percentage);
    return new Money(
      roundFraction(
        this.cents * parsed.coefficient,
        pow10(parsed.scale) * 100n,
      ),
    );
  }

  divide(divisor: DecimalInput): Money {
    const parsed = parseDecimal(divisor);
    if (parsed.coefficient === 0n)
      throw new Error("Cannot divide money by zero");
    return new Money(
      roundFraction(this.cents * pow10(parsed.scale), parsed.coefficient),
    );
  }

  allocate(weights: DecimalInput[]): Money[] {
    if (weights.length === 0) return [];

    const parsedWeights = weights.map(parseDecimal);
    const totalWeight = parsedWeights.reduce(
      (sum, weight) =>
        sum +
        weight.coefficient *
          pow10(
            Math.max(...parsedWeights.map((item) => item.scale)) - weight.scale,
          ),
      0n,
    );
    if (totalWeight <= 0n) return weights.map(() => Money.zero());

    const commonScale = Math.max(
      ...parsedWeights.map((weight) => weight.scale),
    );
    const denominator = totalWeight;
    const allocations = parsedWeights.map((weight) => {
      const numerator =
        this.cents * weight.coefficient * pow10(commonScale - weight.scale);
      const floor =
        numerator >= 0n ? numerator / denominator : -(-numerator / denominator);
      return { floor, remainder: numerator - floor * denominator };
    });
    const allocated = allocations.reduce((sum, item) => sum + item.floor, 0n);
    let remaining = this.cents - allocated;
    const order = allocations
      .map((item, index) => ({ index, remainder: item.remainder }))
      .sort((left, right) =>
        right.remainder > left.remainder
          ? 1
          : right.remainder < left.remainder
            ? -1
            : left.index - right.index,
      );

    const result = allocations.map((item) => item.floor);
    let index = 0;
    while (remaining !== 0n) {
      const direction = remaining > 0n ? 1n : -1n;
      result[order[index % order.length].index] += direction;
      remaining -= direction;
      index += 1;
    }

    return result.map((cents) => new Money(cents));
  }

  compare(value: MoneyInput): -1 | 0 | 1 {
    const other = Money.from(value).cents;
    return this.cents < other ? -1 : this.cents > other ? 1 : 0;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  toString(): string {
    return canonicalMoney(this.cents);
  }
}

export function toMoneyString(
  value: DecimalInput | Money | null | undefined,
): string {
  return value instanceof Money
    ? value.toString()
    : decimalToString(value ?? "0");
}

export function hasSubCentPrecision(
  value: DecimalInput | Money | null | undefined,
): boolean {
  if (value === null || value === undefined || value instanceof Money)
    return false;

  const parsed = parseDecimal(value);
  if (parsed.scale <= 2) return false;

  return parsed.coefficient % pow10(parsed.scale - 2) !== 0n;
}

export function isMoneyString(value: unknown): value is string {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value.trim()))
    return false;
  try {
    return toMoneyString(value) === value;
  } catch {
    return false;
  }
}
