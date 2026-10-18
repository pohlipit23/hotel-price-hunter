# RoomDrop

RoomDrop watches a hotel reservation made through an agency and offers the customer a cheaper equivalent room when the price drops.

## Language

**Original Booking**:
The first reservation the customer makes, through the Altovo B2B agency quotation flow, before RoomDrop is involved.
_Avoid_: initial booking, source booking

**Current Booking**:
Whichever reservation the customer holds right now; it is the Original Booking until the first rebooking replaces it.
_Avoid_: existing booking, active booking

**Drop Watch**:
The standing arrangement that checks a Current Booking for cheaper equivalent offers, armed once the customer consents.
_Avoid_: price watch, monitoring, tracker

**Drop**:
A cheaper equivalent offer for the Current Booking that RoomDrop presents to the customer as a possible rebooking.
_Avoid_: alternative quotation, alternative offer, deal, option
