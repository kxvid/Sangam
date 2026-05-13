import "dotenv/config";

const KEY = process.env.BATCHSKIPTRACE_API_KEY;
const BASE = "https://api.batchdata.com/api/v1";

export type SkipInput = {
  firstName?: string;
  lastName?: string;
  entityName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type SkipResult = {
  phones: string[];
  emails: string[];
  cost: number;
};

export async function skipTrace(input: SkipInput): Promise<SkipResult> {
  if (!KEY) throw new Error("BATCHSKIPTRACE_API_KEY not set");

  const res = await fetch(`${BASE}/property/skip-trace`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          propertyAddress: {
            street: input.address,
            city: input.city,
            state: input.state,
            zip: input.zip,
          },
          name: {
            first: input.firstName,
            last: input.lastName,
            entity: input.entityName,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`BatchSkipTrace ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    results?: {
      persons?: Array<{
        phoneNumbers?: Array<{ number: string }>;
        emails?: Array<{ email: string }>;
      }>;
    };
  };

  const person = json.results?.persons?.[0];
  return {
    phones: person?.phoneNumbers?.map((p) => p.number) ?? [],
    emails: person?.emails?.map((e) => e.email) ?? [],
    cost: 0.15,
  };
}
