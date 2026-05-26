from __future__ import annotations

import logging

from services.agent.app.schemas.ops import OpsAlert


logger = logging.getLogger("services.agent.alerts")


class LogOnlyAlertNotifier:
    def publish(self, alerts: list[OpsAlert]) -> None:
        for alert in alerts:
            logger.warning(
                "ops_alert severity=%s source=%s status_code=%s recommended_mode=%s title=%s",
                alert.severity,
                alert.source,
                alert.status_code,
                alert.recommended_mode,
                alert.title,
            )
