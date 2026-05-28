export interface UnsupportedStackRequest {
  label: string;
  keyword: string;
}

const unsupportedStackMatchers: Array<{ label: string; regex: RegExp }> = [
  { label: "Streamlit", regex: /\bstreamlit\b/i },
  { label: "Django", regex: /\bdjango\b/i },
  { label: "Flask", regex: /\bflask\b/i },
  { label: "FastAPI", regex: /\bfastapi\b/i },
  { label: "Gradio", regex: /\bgradio\b/i },
  { label: "Dash", regex: /\bdash\b/i },
  { label: "Python", regex: /\b(in|using|with)\s+python\b/i },
  {
    label: "Python",
    regex: /\bpython\s+(app|page|project|backend|api|script|website)\b/i,
  },
];

export const detectUnsupportedStackRequest = (
  prompt: string,
): UnsupportedStackRequest | null => {
  if (typeof prompt !== "string") {
    return null;
  }

  for (const matcher of unsupportedStackMatchers) {
    const match = prompt.match(matcher.regex);

    if (match) {
      return {
        label: matcher.label,
        keyword: match[0],
      };
    }
  }

  return null;
};

export const buildUnsupportedStackMessage = (
  detection: UnsupportedStackRequest,
) => {
  return `Helix currently supports generating Next.js (React/TypeScript) apps only. Your prompt requested ${detection.label} (${detection.keyword}). Please rephrase it for a Next.js app and I can generate it right away.`;
};
