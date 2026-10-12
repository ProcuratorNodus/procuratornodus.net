// Start the hub-and-spoke pulses unless the visitor prefers reduced motion.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.diagram .pulse').forEach((p) => p.classList.add('on'));
}
