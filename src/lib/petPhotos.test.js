import { validatePetPhoto } from "./petPhotos";

describe("validatePetPhoto", function () {
  it("accepts common phone photo types", function () {
    ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].forEach(function (t) {
      expect(validatePetPhoto({ type: t, size: 1000 })).toBeNull();
    });
  });
  it("rejects other files, oversized files and no file", function () {
    expect(validatePetPhoto({ type: "application/pdf", size: 10 })).toMatch(/JPEG/);
    expect(validatePetPhoto({ type: "image/jpeg", size: 9 * 1024 * 1024 })).toMatch(/too large/);
    expect(validatePetPhoto(null)).toMatch(/No file/);
  });
});
