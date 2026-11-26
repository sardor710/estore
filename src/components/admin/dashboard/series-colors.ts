// Chart colours. This file must stay free of 'use client': server components (the dashboard page, TrafficSection)
// read these values and pass them to client charts as props; from a client file they would only get a reference.

// Palette slots 1-3 (validated, light surface). One entity keeps one colour on every chart.
// Visitors split: guests keep the visitors hue, signed-in customers take slot 1 (blue never shares a chart with
// revenue), and "unknown" is a neutral grey on purpose: it is missing information, not a category of its own.
export const SERIES_COLOR = { revenue: '#2a78d6', orders: '#eb6834', visitors: '#1baf7a', signedIn: '#2a78d6', guests: '#1baf7a', unknown: '#c3c2b7' } as const
