export const FAMILY_PLANS_OPTIONS = [
  { value: 'want_children', label: 'I want children' },
  { value: 'dont_want_children', label: "I don't want children" },
  { value: 'have_and_want_more', label: 'I have kids & want more' },
  { value: 'have_and_dont_want_more', label: "I have kids & don't want more" },
  { value: 'not_sure', label: 'Not sure yet' },
];

export const COMMUNICATION_STYLE_OPTIONS = [
  { value: 'big_texter', label: 'Big texter' },
  { value: 'phone_caller', label: 'Phone caller' },
  { value: 'video_chatter', label: 'Video chatter' },
  { value: 'better_in_person', label: 'Better in person' },
  { value: 'bad_texter', label: 'Bad texter' },
];

export const LOVE_STYLE_OPTIONS = [
  { value: 'thoughtful_gestures', label: 'Thoughtful gestures' },
  { value: 'receiving_gifts', label: 'Receiving gifts' },
  { value: 'physical_touch', label: 'Physical touch' },
  { value: 'compliments', label: 'Compliments' },
  { value: 'quality_time', label: 'Time together' },
];

export const PETS_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'fish', label: 'Fish' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'small_pet', label: 'Hamster/Rabbit' },
  { value: 'want_a_pet', label: 'Want a pet' },
  { value: 'no_pets', label: 'No pets' },
  { value: 'allergic', label: 'Allergic to pets' },
];

export const SOCIAL_MEDIA_OPTIONS = [
  { value: 'influencer', label: 'Influencer status' },
  { value: 'socially_active', label: 'Socially active' },
  { value: 'off_the_grid', label: 'Off the grid' },
  { value: 'passive_scroller', label: 'Passive scroller' },
];

// Shared value->label lookup for any of the option lists above.
export const traitLabel = (options: { value: string; label: string }[], value: string): string =>
  options.find((opt) => opt.value === value)?.label || value;
