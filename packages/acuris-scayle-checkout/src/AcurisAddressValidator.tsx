import { useCallback, useMemo } from "react";
import { useAcurisValidation } from "./useAcurisValidation.js";
import type { AcurisAddressValidatorProps, ValidatorRenderState } from "./types.js";

/**
 * Render-prop wrapper that validates the supplied `address` on blur,
 * submit, or manual trigger. `address` is a SCAYLE `BaseAddress` (the
 * preferred form — gives Acuris everything it needs to rooftop-match), a
 * lighter `SimpleAddress`, or a fallback free-text string.
 */
export function AcurisAddressValidator(
  props: AcurisAddressValidatorProps,
): React.ReactNode {
  const { endpoints, country, address, trigger = "blur", children } = props;
  const v = useAcurisValidation({ endpoints, country });

  const doValidate = useCallback(() => v.validate(address), [v, address]);

  const formProps = useMemo(
    () => ({
      onBlur: () => {
        if (trigger === "blur") void doValidate();
      },
      onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
        if (trigger === "submit") {
          e.preventDefault();
          void doValidate();
        }
      },
    }),
    [doValidate, trigger],
  );

  const state: ValidatorRenderState = {
    status: v.status,
    result: v.result,
    error: v.error,
    validate: doValidate,
    formProps,
  };

  return children(state);
}
