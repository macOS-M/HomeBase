import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const MAX_RECEIPT_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const extractedItemSchema = z.object({
  name: z.string().min(1),
  cost: z.number().nullable(),
});

const extractedResponseSchema = z.object({
  items: z.array(extractedItemSchema),
});

const NON_ITEM_PATTERNS = [
  /\bsubtotal\b/i,
  /\btotal\b/i,
  /\bcambio\b/i,
  /\btarjetas?\b/i,
  /\biva\b/i,
  /\bimpuesto\b/i,
  /\bprecio\b/i,
  /\barts?\.\s*vendidos\b/i,
  /\btiquete\b/i,
  /\bservicio\s+al\s+cliente\b/i,
  /\baut\s+mediante\b/i,
  /\bvoucher\b/i,
  /\bconsulte\b/i,
  /\bclave\s+numerica\b/i,
  /\bced\b/i,
  /\bte#\b/i,
  /\btr#\b/i,
  /\bop#\b/i,
  /\btda#\b/i,
  /\bkg\b/i,
  /\bg\b/i,
  /\bx\b/i,
];

function normalizeItemName(raw: string) {
  return raw
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    .trim();
}

function isLikelyNonItemName(name: string) {
  if (!name) return true;

  if (NON_ITEM_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }

  if (/^\d+$/.test(name)) {
    return true;
  }

  if (/\d{7,}/.test(name)) {
    return true;
  }

  const letters = (name.match(/[A-Za-z]/g) ?? []).length;
  const digits = (name.match(/\d/g) ?? []).length;
  if (letters === 0 || digits > letters) {
    return true;
  }

  return false;
}

function parseGeminiJsonResponse(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('Gemini returned an empty response.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!fenceMatch?.[1]) {
      throw new Error('Gemini response was not valid JSON.');
    }
    return JSON.parse(fenceMatch[1]);
  }
}

export async function POST(request: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!geminiApiKey) {
    return NextResponse.json(
      { error: 'Missing GEMINI_API_KEY in server environment.' },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const receipt = formData.get('receipt');

  if (!(receipt instanceof File)) {
    return NextResponse.json(
      { error: 'No receipt image found in request.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(receipt.type)) {
    return NextResponse.json(
      {
        error:
          'Unsupported file type. Upload a JPG, PNG, or WEBP image.',
      },
      { status: 400 }
    );
  }

  if (receipt.size > MAX_RECEIPT_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'Receipt image is too large. Max size is 8MB.' },
      { status: 400 }
    );
  }

  const imageBuffer = Buffer.from(await receipt.arrayBuffer());
  const imageData = imageBuffer.toString('base64');

  const prompt = [
    'You are extracting line items from a shopping receipt image.',
    'Return ONLY JSON with this exact structure:',
    '{"items":[{"name":"string","cost":number|null}]}',
    'Rules:',
    '- Include only actual purchased line items.',
    '- Ignore tax, subtotal, discounts, totals, tender, change, barcodes, product codes, transaction IDs, and store metadata.',
    '- If a row has an item name + product code + price, keep only the item name and price.',
    '- Item name must NOT include long numeric codes.',
    '- Use concise but specific item names.',
    '- cost must be a number with decimal when possible.',
    '- If a cost cannot be determined for an item, set cost to null.',
  ].join('\n');

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: receipt.type,
                  data: imageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    let providerMessage = 'Gemini request failed.';
    try {
      const parsed = JSON.parse(errorText);
      if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) {
        providerMessage = parsed.error.message;
      }
    } catch {
      if (errorText.trim()) {
        providerMessage = errorText.trim();
      }
    }

    const passthroughStatuses = new Set([400, 401, 403, 404, 408, 409, 429]);
    const status = passthroughStatuses.has(geminiResponse.status) ? geminiResponse.status : 502;

    return NextResponse.json(
      {
        error: providerMessage,
        detail: errorText.slice(0, 600),
        model: geminiModel,
        upstreamStatus: geminiResponse.status,
      },
      { status }
    );
  }

  const geminiPayload = await geminiResponse.json();
  const modelText =
    geminiPayload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n') ?? '';

  try {
    const parsedJson = parseGeminiJsonResponse(modelText);
    const parsed = extractedResponseSchema.parse(parsedJson);
    const normalizedItems = parsed.items
      .map((item) => ({
        name: normalizeItemName(item.name),
        cost:
          typeof item.cost === 'number' && Number.isFinite(item.cost) && item.cost >= 0
            ? Math.round(item.cost * 100) / 100
            : null,
      }))
      .filter((item) => item.name.length > 0)
      .filter((item) => !isLikelyNonItemName(item.name));

    const total = normalizedItems.reduce((sum, item) => sum + (item.cost ?? 0), 0);

    return NextResponse.json({
      items: normalizedItems,
      total: Math.round(total * 100) / 100,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? 'Unable to parse Gemini response.',
        raw: modelText.slice(0, 1000),
      },
      { status: 422 }
    );
  }
}