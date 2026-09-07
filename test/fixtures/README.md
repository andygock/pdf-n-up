The `red.jp2` fixture is a generated 4 × 4 pixel solid red RGB JPEG 2000 image.
It contains no third-party document or personal data and is covered by this
repository's MIT licence. It was generated with Pillow and OpenJPEG:

```python
from PIL import Image
Image.new("RGB", (4, 4), (255, 0, 0)).save(
    "red.jp2", format="JPEG2000", irreversible=False
)
```

Tests construct the surrounding PDFs in memory. Pillow is not needed to run
the tests; the tiny encoded fixture exercises the shipped PDF.js decoder.
