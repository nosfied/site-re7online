import test from "node:test";
import assert from "node:assert/strict";
import { extractMessageLocation, formatMessageLocationText } from "./messageLocation.js";

test("extractMessageLocation returns coordinates and map links from raw payload", () => {
  const location = extractMessageLocation({
    location: {
      latitude: -27.3435,
      longitude: -51.6112,
      name: "SIMAE Capinzal",
      address: "Rua Domingos Omizollo, 447",
    },
  });

  assert.equal(location?.latitude, -27.3435);
  assert.equal(location?.longitude, -51.6112);
  assert.equal(location?.name, "SIMAE Capinzal");
  assert.equal(location?.address, "Rua Domingos Omizollo, 447");
  assert.match(location?.googleMapsUrl ?? "", /google\.com\/maps/);
  assert.match(location?.openStreetMapUrl ?? "", /openstreetmap\.org/);
});

test("extractMessageLocation rejects invalid coordinates", () => {
  assert.equal(extractMessageLocation({ location: { latitude: "x", longitude: -51.6112 } }), null);
  assert.equal(extractMessageLocation({ media: { mediaId: "media-1" } }), null);
});

test("formatMessageLocationText builds an export-safe text value", () => {
  const location = extractMessageLocation({
    location: {
      latitude: -27.3435,
      longitude: -51.6112,
      name: "SIMAE Capinzal",
      address: "Rua Domingos Omizollo, 447",
    },
  });

  assert.equal(
    formatMessageLocationText(location),
    "SIMAE Capinzal - Rua Domingos Omizollo, 447 (-27.343500, -51.611200)"
  );
});
