import test from "node:test";
import assert from "node:assert/strict";

import { effectiveItemLocation, formatLocation, isInheritedItemLocation } from "../lib/location";

test("formatLocation joins non-empty structured location parts", () => {
    assert.equal(
        formatLocation({
            id: "loc-1",
            name: "Old name",
            country: " Kazakhstan ",
            city: "Almaty",
            room: " Storage ",
            shelf: "",
        }),
        "Kazakhstan / Almaty / Storage",
    );
});

test("formatLocation falls back to name when no structured parts exist", () => {
    assert.equal(formatLocation({ id: "loc-1", name: "Garage" }), "Garage");
});

test("effectiveItemLocation prefers explicit item location over inherited location", () => {
    const location = { id: "loc-1", name: "Shelf" };
    const inheritedLocation = { id: "loc-2", name: "Box shelf" };

    assert.equal(effectiveItemLocation({ location, inherited_location: inheritedLocation }), location);
    assert.equal(isInheritedItemLocation({ location, inherited_location: inheritedLocation }), false);
});

test("effectiveItemLocation uses inherited location when item location is absent", () => {
    const inheritedLocation = { id: "loc-2", name: "Box shelf" };

    assert.equal(effectiveItemLocation({ inherited_location: inheritedLocation }), inheritedLocation);
    assert.equal(isInheritedItemLocation({ inherited_location: inheritedLocation }), true);
});
