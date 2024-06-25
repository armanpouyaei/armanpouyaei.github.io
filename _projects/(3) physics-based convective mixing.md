---
name: Development and Implementation of a Physics‐Based Convective Mixing Scheme in the Community Multiscale Air Quality Modeling Framework
tools: [Chemical transport modeling, Model development, Fortran, Convective mixing]
image: https://i.imgur.com/1Q7wC6u.jpeg
description: This study introduces a more physically accurate convective mixing model based on the Kain and Fritsch scheme, implemented in the Community Multiscale Air Quality model.
---

# Development and Implementation of a Physics‐Based Convective Mixing Scheme in the Community Multiscale Air Quality Modeling Framework

This study introduces a more physically accurate convective mixing model based on the Kain and Fritsch scheme, implemented in the Community Multiscale Air Quality (CMAQ) model. The KF-convection method accounts for updraft flux, downdraft flux, entrainment, detrainment, and the subsidence effect, consistent with the convection parametrization of the meteorology model.

We validated the convective mixing processes involved in the developed scheme for an idealized case and then implemented it into the CMAQ modeling platform. We applied the model to a reference setup for East Asia during the KORUS-AQ campaign period to investigate its impact on carbon monoxide (CO) concentration at various atmospheric altitudes.

![preview](https://i.imgur.com/937lqFx.jpeg)


The direct impact caused by vertical movement of CO concentrations and the indirect impact due to transported lifted CO concentrations to another region were both significant. Notably, the KF-convection model accurately represented updraft and downdraft fluxes, improving the overall agreement with observed data.

![preview](https://i.imgur.com/cnHMzAn.jpeg)
![preview](https://i.imgur.com/Ip0iene.jpeg)

The KF-convection model demonstrates the importance of accurate convective mixing representation in CTMs and offers a robust approach for modeling the vertical and horizontal distribution of atmospheric pollutants.

<p class="text-center">
{% include elements/button.html link="https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2021MS002475" text="Learn More" %}
</p>
