import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { renderCard } from "@/server/card";

describe("branded card", () => {
  it("renders a PNG in every look and shape", async () => {
    for (const style of ["bold", "light", "dark"] as const) for (const format of ["landscape", "square", "portrait"] as const) {
      const png = await renderCard({ headline: "Spring internships are open", sub: "Six paid remote roles in marketing and design", kicker: "WE'RE HIRING",
        brand: "Paragon Global Internships", color: "#0a66c2", style, format });
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.length).toBeGreaterThan(5000);
      if (process.env.CARD_OUT) writeFileSync(`${process.env.CARD_OUT}/card-${style}-${format}.png`, png);
    }
  });
});
