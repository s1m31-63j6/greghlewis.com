// Function v4 programming model entrypoint. Each import registers its
// HTTP/timer triggers via `app.http(...)` / `app.timer(...)` side effects.

import "./functions/chat.js";
import "./functions/pbiResume.js";
import "./functions/pbiPause.js";
import "./functions/pbiStatus.js";
import "./functions/idlePauseTimer.js";
