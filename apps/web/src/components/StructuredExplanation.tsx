import { STRUCTURED_FIELD_LABELS, type StructuredExplanation as StructuredExplanationFields } from "@aerobrief/core/explain";

export interface StructuredExplanationProps {
  /** The five fields built by `explainStructured`. All are plain-language, non-empty strings. */
  explanation: StructuredExplanationFields;
  className?: string;
}

const FIELD_ORDER = ["whatsHappening", "why", "likelyImpact", "nextUpdate", "source"] as const;

/** The five labeled explanation fields (Requirements 3.1, 3.2, 3.3, 3.7) as a description list. */
export function StructuredExplanation({ explanation, className }: StructuredExplanationProps) {
  const classes = ["structured-explanation", className].filter(Boolean).join(" ");
  return (
    <dl className={classes}>
      {FIELD_ORDER.map((key) => (
        <div className="structured-explanation__field" key={key}>
          <dt className="structured-explanation__label">{STRUCTURED_FIELD_LABELS[key]}</dt>
          <dd className="structured-explanation__value">{explanation[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
