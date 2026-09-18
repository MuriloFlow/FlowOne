export function onlyCpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function isValidCpf(value: string): boolean {
  const digits = onlyCpfDigits(value)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const numbers = digits.split('').map(Number)
  const check = (length: number) => {
    const sum = numbers.slice(0, length).reduce((total, digit, index) => {
      return total + digit * (length + 1 - index)
    }, 0)
    const rest = (sum * 10) % 11
    return (rest === 10 ? 0 : rest) === numbers[length]
  }

  return check(9) && check(10)
}

export function formatCpf(value: string): string {
  const digits = onlyCpfDigits(value)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function maskCpf(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = onlyCpfDigits(value)
  if (digits.length !== 11) return null
  return `***.***.***-${digits.slice(9)}`
}
