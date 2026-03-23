"use strict";

/**
 * Creates and updates ioBroker states from Stellantis API payloads.
 */

/**
 * Ensure a channel (folder) exists.
 */
async function ensureChannel(adapter, id, name) {
    await adapter.setObjectNotExistsAsync(id, {
        type: "channel",
        common: { name },
        native: {},
    });
}

/**
 * Set or create a state with the given value and metadata.
 */
async function setState(adapter, id, common, val) {
    await adapter.setObjectNotExistsAsync(id, {
        type: "state",
        common: {
            name: common.name || id,
            type: common.type || "string",
            role: common.role || "value",
            read: true,
            write: common.write || false,
            unit: common.unit || "",
            def: common.def !== undefined ? common.def : null,
        },
        native: {},
    });
    await adapter.setStateAsync(id, { val, ack: true });
}

/**
 * Parse and write the full vehicle status payload into ioBroker states.
 * @param {object} adapter
 * @param {string} vin
 * @param {object} status   - Vehicle status from API
 * @param {object} vehicle  - Vehicle info (id, brand, model etc.)
 */
async function writeVehicleStatus(adapter, vin, status, vehicle) {
    const base = vin;

    await ensureChannel(adapter, base, vehicle?.label || vin);
    await ensureChannel(adapter, `${base}.info`, "Vehicle Info");
    await ensureChannel(adapter, `${base}.status`, "Status");
    await ensureChannel(adapter, `${base}.battery`, "Battery / Energy");
    await ensureChannel(adapter, `${base}.doors`, "Doors");
    await ensureChannel(adapter, `${base}.windows`, "Windows");
    await ensureChannel(adapter, `${base}.location`, "Location");
    await ensureChannel(adapter, `${base}.mileage`, "Mileage");
    await ensureChannel(adapter, `${base}.preconditioning`, "Air Conditioning");
    await ensureChannel(adapter, `${base}.commands`, "Remote Commands");

    // ── Info ─────────────────────────────────────────────────────────────────
    await setState(adapter, `${base}.info.vin`, { name: "VIN", role: "text" }, vin);
    await setState(adapter, `${base}.info.label`, { name: "Label", role: "text" }, vehicle?.label || "");
    await setState(adapter, `${base}.info.brand`, { name: "Brand", role: "text" }, vehicle?.brand || "");
    await setState(adapter, `${base}.info.model`, { name: "Model", role: "text" }, vehicle?.shortLabel || "");

    // ── Timestamp ────────────────────────────────────────────────────────────
    await setState(adapter, `${base}.status.lastUpdate`, { name: "Last Update", role: "date", type: "string" }, status?.updatedAt || "");

    // ── Ignition / running ───────────────────────────────────────────────────
    const ignition = status?.ignition?.type;
    await setState(adapter, `${base}.status.ignition`, { name: "Ignition", role: "indicator", type: "string" }, ignition || "");
    await setState(adapter, `${base}.status.isRunning`, { name: "Engine running", role: "indicator", type: "boolean" }, ignition === "StartUp");

    // ── Mileage ──────────────────────────────────────────────────────────────
    const mileage = status?.odometer?.mileage;
    await setState(adapter, `${base}.mileage.total`, { name: "Total mileage", role: "value", unit: "km", type: "number" }, mileage != null ? Math.round(mileage) : null);

    // ── Battery (EV) ─────────────────────────────────────────────────────────
    const energy = status?.energies?.[0];
    if (energy) {
        await setState(adapter, `${base}.battery.level`, { name: "Battery %", role: "value.battery", unit: "%", type: "number" }, energy.level != null ? energy.level : null);
        await setState(adapter, `${base}.battery.autonomy`, { name: "Remaining range", role: "value", unit: "km", type: "number" }, energy.autonomy != null ? energy.autonomy : null);
        await setState(adapter, `${base}.battery.type`, { name: "Energy type", role: "text", type: "string" }, energy.type || "");
    }

    // ── Charging ─────────────────────────────────────────────────────────────
    const charging = status?.energies?.[0]?.charging;
    if (charging) {
        await setState(adapter, `${base}.battery.charging`, { name: "Is charging", role: "indicator.charging", type: "boolean" }, charging.status === "InProgress");
        await setState(adapter, `${base}.battery.chargingStatus`, { name: "Charging status", role: "text" }, charging.status || "");
        await setState(adapter, `${base}.battery.chargingMode`, { name: "Charging mode", role: "text" }, charging.chargingMode || "");
        await setState(adapter, `${base}.battery.chargingRate`, { name: "Charging rate", role: "value", unit: "km/h", type: "number" }, charging.chargingRate != null ? charging.chargingRate : null);
        await setState(adapter, `${base}.battery.remainingTime`, { name: "Remaining charging time", role: "value", unit: "min", type: "number" }, charging.remainingTime != null ? charging.remainingTime : null);
        await setState(adapter, `${base}.battery.plugged`, { name: "Plugged in", role: "indicator", type: "boolean" }, charging.plugged === true);
        await setState(adapter, `${base}.battery.chargeLimit`, { name: "Charge limit", role: "value", unit: "%", type: "number" }, charging.chargingSetpoint != null ? charging.chargingSetpoint : null);
    }

    // ── Preconditioning ───────────────────────────────────────────────────────
    const ac = status?.airConditioning;
    if (ac) {
        await setState(adapter, `${base}.preconditioning.active`, { name: "Active", role: "indicator", type: "boolean" }, ac.status === "Enabled");
        await setState(adapter, `${base}.preconditioning.status`, { name: "Status", role: "text" }, ac.status || "");
    }

    // ── Doors ────────────────────────────────────────────────────────────────
    const doors = status?.doorsState?.lockedStates;
    if (Array.isArray(doors)) {
        for (const d of doors) {
            const key = (d.doorIdentifier || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");
            await setState(adapter, `${base}.doors.${key}`, { name: d.doorIdentifier, role: "indicator", type: "boolean" }, d.locked === true);
        }
    }
    const allLocked = status?.doorsState?.lockedStates?.every((d) => d.locked);
    await setState(adapter, `${base}.doors.allLocked`, { name: "All doors locked", role: "indicator", type: "boolean" }, allLocked || false);

    // ── Location ─────────────────────────────────────────────────────────────
    const pos = status?.lastPosition?.geometry?.coordinates;
    if (Array.isArray(pos) && pos.length >= 2) {
        await setState(adapter, `${base}.location.longitude`, { name: "Longitude", role: "value.gps.longitude", unit: "°", type: "number" }, pos[0]);
        await setState(adapter, `${base}.location.latitude`, { name: "Latitude", role: "value.gps.latitude", unit: "°", type: "number" }, pos[1]);
    }
    const heading = status?.lastPosition?.properties?.heading;
    if (heading != null) {
        await setState(adapter, `${base}.location.heading`, { name: "Heading", role: "value", unit: "°", type: "number" }, heading);
    }

    // ── Write-capable command states ─────────────────────────────────────────
    await adapter.setObjectNotExistsAsync(`${base}.commands.wakeUp`, {
        type: "state",
        common: { name: "Wake Up", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.doorLock`, {
        type: "state",
        common: { name: "Lock doors (true=lock, false=unlock)", type: "boolean", role: "switch", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.startPreconditioning`, {
        type: "state",
        common: { name: "Start preconditioning", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.stopPreconditioning`, {
        type: "state",
        common: { name: "Stop preconditioning", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.startCharging`, {
        type: "state",
        common: { name: "Start charging (EV)", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.stopCharging`, {
        type: "state",
        common: { name: "Stop charging (EV)", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.chargeLimit`, {
        type: "state",
        common: { name: "Set charge limit (0-100 %)", type: "number", role: "level", read: true, write: true, unit: "%", def: 80 },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.flashLights`, {
        type: "state",
        common: { name: "Flash lights", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
    await adapter.setObjectNotExistsAsync(`${base}.commands.honk`, {
        type: "state",
        common: { name: "Honk horn", type: "boolean", role: "button", read: false, write: true, def: false },
        native: {},
    });
}

module.exports = { writeVehicleStatus };
