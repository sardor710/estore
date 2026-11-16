import type { L10n } from '@/lib/localized'

export type Region = { code: string; name: L10n }

export const REGIONS: Region[] = [
  { code: 'tashkent-city', name: { uz: 'Toshkent shahri', ru: 'город Ташкент', en: 'Tashkent city' } },
  { code: 'tashkent', name: { uz: 'Toshkent viloyati', ru: 'Ташкентская область', en: 'Tashkent region' } },
  { code: 'andijan', name: { uz: 'Andijon viloyati', ru: 'Андижанская область', en: 'Andijan region' } },
  { code: 'bukhara', name: { uz: 'Buxoro viloyati', ru: 'Бухарская область', en: 'Bukhara region' } },
  { code: 'fergana', name: { uz: 'Fargʻona viloyati', ru: 'Ферганская область', en: 'Fergana region' } },
  { code: 'jizzakh', name: { uz: 'Jizzax viloyati', ru: 'Джизакская область', en: 'Jizzakh region' } },
  { code: 'kashkadarya', name: { uz: 'Qashqadaryo viloyati', ru: 'Кашкадарьинская область', en: 'Kashkadarya region' } },
  { code: 'khorezm', name: { uz: 'Xorazm viloyati', ru: 'Хорезмская область', en: 'Khorezm region' } },
  { code: 'namangan', name: { uz: 'Namangan viloyati', ru: 'Наманганская область', en: 'Namangan region' } },
  { code: 'navoi', name: { uz: 'Navoiy viloyati', ru: 'Навоийская область', en: 'Navoi region' } },
  { code: 'samarkand', name: { uz: 'Samarqand viloyati', ru: 'Самаркандская область', en: 'Samarkand region' } },
  { code: 'surkhandarya', name: { uz: 'Surxondaryo viloyati', ru: 'Сурхандарьинская область', en: 'Surkhandarya region' } },
  { code: 'syrdarya', name: { uz: 'Sirdaryo viloyati', ru: 'Сырдарьинская область', en: 'Syrdarya region' } },
  { code: 'karakalpakstan', name: { uz: 'Qoraqalpogʻiston Respublikasi', ru: 'Республика Каракалпакстан', en: 'Republic of Karakalpakstan' } },
]

export function getRegion(code: string): Region | undefined {
  return REGIONS.find((r) => r.code === code)
}
