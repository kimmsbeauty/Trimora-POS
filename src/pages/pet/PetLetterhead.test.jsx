import React from "react";
import { render, screen } from "@testing-library/react";
import PetLetterhead from "./PetLetterhead";

describe("PetLetterhead brand preset", function () {
  it("shows the PawPals logo and tagline when the business has not set its own", function () {
    render(<PetLetterhead salon={{ name: "PawPals Kenya", slug: "pawpals-ke" }} />);
    expect(screen.getByAltText("PawPals Kenya logo")).toBeTruthy();
    expect(screen.getByText("Pet Grooming & Pet Care")).toBeTruthy();
  });
  it("keeps a logo and tagline saved in Settings", function () {
    render(<PetLetterhead salon={{ name: "PawPals Kenya", logo_url: "https://x.test/own.png", tagline: "Our own line" }} />);
    expect(screen.getByAltText("PawPals Kenya logo").getAttribute("src")).toBe("https://x.test/own.png");
    expect(screen.getByText("Our own line")).toBeTruthy();
  });
  it("shows only the name for a business with no preset and no logo", function () {
    render(<PetLetterhead salon={{ name: "Happy Tails" }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Happy Tails")).toBeTruthy();
  });
});
