import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

var mockList = vi.fn(); var mockUpload = vi.fn(); var mockDelete = vi.fn();
vi.mock("../../lib/petPhotos", () => ({
  listPetPhotos: function () { return mockList.apply(null, arguments); },
  uploadPetPhoto: function () { return mockUpload.apply(null, arguments); },
  deletePetPhoto: function () { return mockDelete.apply(null, arguments); },
  validatePetPhoto: function (f) { return f && f.type === "image/jpeg" ? null : "Please choose a JPEG, PNG, WEBP or HEIC photo."; },
}));

import PetPhotos from "./PetPhotos";

var P1 = { id: "p1", storage_path: "s/pet/1-a.jpg", created_at: "2026-10-27T10:00:00Z", url: "https://x.test/a.jpg" };

describe("PetPhotos", function () {
  beforeEach(function () { mockList.mockReset(); mockUpload.mockReset(); mockDelete.mockReset(); });

  it("shows an empty state and adds a photo", async function () {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([P1]);
    mockUpload.mockResolvedValue({ id: "p1" });
    render(<PetPhotos petId="pet1" canDelete={false} />);
    expect(await screen.findByText("No photos yet.")).toBeTruthy();
    var file = new File(["x"], "dog.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add photo"), { target: { files: [file] } });
    await waitFor(function () { expect(mockUpload).toHaveBeenCalledWith("pet1", file); });
    expect(await screen.findByAltText("Pet")).toBeTruthy();
  });

  it("rejects a bad file without uploading", async function () {
    mockList.mockResolvedValue([]);
    render(<PetPhotos petId="pet1" canDelete={false} />);
    await screen.findByText("No photos yet.");
    fireEvent.change(screen.getByLabelText("Add photo"), { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/Please choose a JPEG/)).toBeTruthy();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("only offers delete to admins, and asks to confirm", async function () {
    mockList.mockResolvedValueOnce([P1]).mockResolvedValueOnce([]);
    mockDelete.mockResolvedValue();
    var view = render(<PetPhotos petId="pet1" canDelete={true} />);
    fireEvent.click(await screen.findByLabelText("View photo"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(function () { expect(mockDelete).toHaveBeenCalledWith(P1); });
    view.unmount();
  });

  it("hides delete from non-admins", async function () {
    mockList.mockResolvedValue([P1]);
    render(<PetPhotos petId="pet1" canDelete={false} />);
    fireEvent.click(await screen.findByLabelText("View photo"));
    await screen.findByRole("button", { name: "Close" });
    expect(screen.queryByRole("button", { name: "Delete photo" })).toBeNull();
  });

  it("explains when the photos table is not available", async function () {
    mockList.mockResolvedValue(null);
    render(<PetPhotos petId="pet1" canDelete={false} />);
    expect(await screen.findByText(/migration 109/)).toBeTruthy();
    expect(screen.queryByLabelText("Add photo")).toBeNull();
  });
});
