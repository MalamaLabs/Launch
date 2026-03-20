package malama.sensor

default valid = false
default quarantine = false
default slash = false
default replay_attack = false
default out_of_range = false
default signature_invalid = false

valid {
    not quarantine
    not slash
    not replay_attack
    not out_of_range
    not signature_invalid
}

quarantine {
    input.confidence < 0.80
}

slash {
    input.tampering_probability > 0.90
}

replay_attack {
    input.nonce == input.previous_nonce
}

out_of_range {
    some key
    val := input.readings[key]
    min_val := input.sensor_profile[key].min
    val < min_val
}

out_of_range {
    some key
    val := input.readings[key]
    max_val := input.sensor_profile[key].max
    val > max_val
}

signature_invalid {
    input.signature_verified == false
}
